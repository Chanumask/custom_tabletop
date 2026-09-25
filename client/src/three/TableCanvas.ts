import * as THREE from 'three';
import { gridLineOffsets, segmentPixelRect } from './tableCoordinates.js';
import type { Drawing, Point2D, Scene } from '@custom-tabletop/shared';
import { computeCoverRect } from './imageFit.js';
import { parchmentSheet } from './parchment.js';

/** The canvas's *logical* size — the coordinate space every stroke point
 * (and the server's stroke-width bounds) is expressed in. Unchanged since
 * Milestone 5, so stored drawings and the wire format are unaffected. */
export const TABLE_CANVAS_SIZE = 1024;
/** The texture's actual pixel size — rendered at 2x the logical size so an
 * uploaded map stays crisp on a 2m table viewed full-screen, not just the
 * strokes on top of it. Also the resolution map images are baked at by the
 * crop dialog, so they're drawn 1:1. */
export const TABLE_TEXTURE_PIXELS = 2048;
const RESOLUTION_SCALE = TABLE_TEXTURE_PIXELS / TABLE_CANVAS_SIZE;
/** Blank parchment — the table with no map, and what shows around a map
 * image that doesn't cover the whole table (see MapCropDialog). */
export const TABLE_PARCHMENT = '#e6d4b0';

export interface StrokeStyle {
  color: string;
  width: number;
}

/** Only used if `extendStroke` is somehow called for a drawingId before its
 * style was ever set — shouldn't happen in practice (the first call always
 * carries one), but keeps drawing from silently no-op-ing/throwing. */
const FALLBACK_STYLE: StrokeStyle = { color: '#241a12', width: 5 };

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load background image: ${url}`));
    image.src = url;
  });
}

/**
 * The 2D canvas (background image + drawing) that becomes a
 * `THREE.CanvasTexture` on the table surface — Milestone 5's "physical
 * surface on the table" (docs/engineering/architecture.md), not a
 * full-screen overlay. `flipY = false` so canvas-row-from-top maps directly
 * to UV `v` with no inversion, matching `remapTableTopUV`/
 * `tableLocalToCanvas`'s shared convention.
 */
export class TableCanvas {
  readonly texture: THREE.CanvasTexture;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly lastPoint = new Map<string, Point2D>();
  private readonly strokeStyle = new Map<string, StrokeStyle>();
  private loadToken = 0;
  /** The same canvas as a second texture that's never rendered: the source
   * `flush` uploads changed pixels from. (A texture three.js has never put
   * on the GPU is read straight from its canvas.) */
  private readonly stager: THREE.Texture;
  /** Canvas pixels strokes changed since the last flush. */
  private dirty: THREE.Box2 | null = null;
  /** A full redraw is waiting for its whole-canvas upload. */
  private fullUploadPending = true;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = TABLE_CANVAS_SIZE * RESOLUTION_SCALE;
    this.canvas.height = TABLE_CANVAS_SIZE * RESOLUTION_SCALE;
    // CPU-backed: the per-frame partial uploads (flush) read straight from
    // it, where a GPU canvas would first be read back whole every frame.
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('2D canvas context unavailable');
    }
    this.ctx = ctx;
    // Everything below draws in logical (TABLE_CANVAS_SIZE) units.
    this.ctx.setTransform(RESOLUTION_SCALE, 0, 0, RESOLUTION_SCALE, 0, 0);
    this.ctx.imageSmoothingQuality = 'high';

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.flipY = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.stager = new THREE.Texture(this.canvas);
  }

  /**
   * Puts what strokes changed since the last frame on the GPU — only that
   * rectangle, not the whole 2048² canvas (docs/decisions.md, "Drawing
   * lag": re-uploading all 16 MB, and remaking its mipmaps, for every point
   * dropped everyone at the table to ~7 fps while someone drew). Call once a
   * frame, before rendering.
   */
  flush(renderer: THREE.WebGLRenderer): void {
    if (this.fullUploadPending) {
      // The whole canvas goes up with the next render anyway.
      this.fullUploadPending = false;
      this.dirty = null;
      return;
    }
    if (!this.dirty) {
      return;
    }
    const region = this.dirty;
    this.dirty = null;
    renderer.copyTextureToTexture(
      this.stager,
      this.texture,
      region,
      new THREE.Vector2(region.min.x, region.min.y),
    );
  }

  /** Grows the dirty rectangle over a segment `from`–`to` of `width`
   * (logical units), in canvas pixels. */
  private markDirty(from: Point2D, to: Point2D, width: number): void {
    const rect = segmentPixelRect(from, to, width, RESOLUTION_SCALE, TABLE_TEXTURE_PIXELS);
    if (!rect) return;
    const box = new THREE.Box2(
      new THREE.Vector2(rect.minX, rect.minY),
      new THREE.Vector2(rect.maxX, rect.maxY),
    );
    if (this.dirty) this.dirty.union(box);
    else this.dirty = box;
  }

  /** Full redraw — background image (or the parchment fallback) plus every
   * stroke. Used on join and whenever the active scene or its background
   * changes; point-by-point drawing uses `extendStroke` instead.
   *
   * `currentDrawings`, when given, is read *after* the background image has
   * loaded rather than snapshotting `scene.drawings` up front — strokes
   * drawn (by anyone) while a new map image was still downloading would
   * otherwise be painted over and lost from view. A redraw superseded by a
   * newer one while its image loads does nothing. */
  async redraw(scene: Scene, currentDrawings?: () => Drawing[]): Promise<void> {
    const token = ++this.loadToken;
    const image = scene.backgroundImage
      ? await loadImage(scene.backgroundImage).catch(() => null)
      : null;
    if (token !== this.loadToken) {
      return; // superseded by a later redraw while the image was loading
    }

    this.lastPoint.clear();
    this.ctx.drawImage(
      parchmentSheet(TABLE_TEXTURE_PIXELS, TABLE_PARCHMENT),
      0,
      0,
      TABLE_CANVAS_SIZE,
      TABLE_CANVAS_SIZE,
    );
    if (image) {
      // The crop dialog (MapCropDialog.tsx) already produces a square image
      // framed exactly as intended, so this is a 1:1 draw for those; any
      // other image is "cover"-fitted (no stretching) as a fallback.
      const rect = computeCoverRect(image.naturalWidth, image.naturalHeight, TABLE_CANVAS_SIZE);
      this.ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    }
    this.paintGrid(scene.gridCells);

    for (const drawing of currentDrawings?.() ?? scene.drawings) {
      this.paintStroke(drawing.points, { color: drawing.color, width: drawing.width });
    }
    this.texture.needsUpdate = true;
    this.fullUploadPending = true;
    this.dirty = null;
  }

  /** The map grid, over the background and under the drawings: a dark line
   * with a faint light edge, so it reads on parchment and dark maps alike. */
  private paintGrid(cells: number): void {
    const offsets = gridLineOffsets(cells, TABLE_CANVAS_SIZE);
    if (offsets.length === 0) {
      return;
    }
    const passes: [string, number][] = [
      ['rgba(20, 14, 10, 0.38)', 1.6],
      ['rgba(255, 248, 236, 0.22)', 0.7],
    ];
    for (const [style, width] of passes) {
      this.ctx.strokeStyle = style;
      this.ctx.lineWidth = width;
      this.ctx.beginPath();
      for (const offset of offsets) {
        this.ctx.moveTo(offset, 0);
        this.ctx.lineTo(offset, TABLE_CANVAS_SIZE);
        this.ctx.moveTo(0, offset);
        this.ctx.lineTo(TABLE_CANVAS_SIZE, offset);
      }
      this.ctx.stroke();
    }
  }

  /** Draws one incremental segment of an in-progress stroke — from the
   * previous point (drawing:start's first point, or the last
   * drawing:update) to this new one. A lone point with no predecessor is
   * drawn as a dot, so a tap-without-drag is still visible. `style` is
   * chosen once per stroke (Milestone 8's drawing toolbar) — pass it on the
   * first call for a given `drawingId` (typically from drawing:start, which
   * carries it); later calls for the same id reuse the stored style and can
   * omit it. */
  extendStroke(drawingId: string, point: Point2D, style?: StrokeStyle): void {
    if (style) {
      this.strokeStyle.set(drawingId, style);
    }
    const activeStyle = this.strokeStyle.get(drawingId) ?? FALLBACK_STYLE;

    const from = this.lastPoint.get(drawingId);
    if (from) {
      this.strokeSegment(from, point, activeStyle);
    } else {
      this.strokeDot(point, activeStyle);
    }
    this.lastPoint.set(drawingId, point);
    this.markDirty(from ?? point, point, activeStyle.width);
  }

  /** Stops tracking a finished/deleted stroke's last point and style, so an
   * unrelated future stroke reusing a drawingId (it won't, ids are fresh
   * UUIDs, but defensively) never connects to or restyles from it. */
  endStroke(drawingId: string): void {
    this.lastPoint.delete(drawingId);
    this.strokeStyle.delete(drawingId);
  }

  dispose(): void {
    this.texture.dispose();
    this.stager.dispose();
  }

  private paintStroke(points: Point2D[], style: StrokeStyle): void {
    const [first, ...rest] = points;
    if (!first) {
      return;
    }
    if (rest.length === 0) {
      this.strokeDot(first, style);
      return;
    }
    this.ctx.strokeStyle = style.color;
    this.ctx.lineWidth = style.width;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.beginPath();
    this.ctx.moveTo(first.x, first.y);
    for (const point of rest) {
      this.ctx.lineTo(point.x, point.y);
    }
    this.ctx.stroke();
  }

  private strokeSegment(from: Point2D, to: Point2D, style: StrokeStyle): void {
    this.ctx.strokeStyle = style.color;
    this.ctx.lineWidth = style.width;
    this.ctx.lineCap = 'round';
    this.ctx.beginPath();
    this.ctx.moveTo(from.x, from.y);
    this.ctx.lineTo(to.x, to.y);
    this.ctx.stroke();
  }

  private strokeDot(point: Point2D, style: StrokeStyle): void {
    this.ctx.fillStyle = style.color;
    this.ctx.beginPath();
    this.ctx.arc(point.x, point.y, style.width / 2, 0, Math.PI * 2);
    this.ctx.fill();
  }
}
