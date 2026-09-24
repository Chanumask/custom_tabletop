import * as THREE from 'three';
import type { Point2D, Scene } from '@custom-tabletop/shared';
import { computeCoverRect } from './imageFit.js';

export const TABLE_CANVAS_SIZE = 1024;
const BACKGROUND_COLOR = '#e8dcc0'; // blank parchment — a scene with no backgroundImage yet

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

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = TABLE_CANVAS_SIZE;
    this.canvas.height = TABLE_CANVAS_SIZE;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D canvas context unavailable');
    }
    this.ctx = ctx;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.flipY = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  /** Full redraw from a GameState snapshot — background image (or the
   * parchment fallback) plus every accumulated stroke. Used on join and
   * whenever the active scene changes or its background is updated;
   * point-by-point drawing updates use `extendStroke` instead. Guards
   * against an image load from a stale/superseded scene finishing after a
   * newer `redraw` already started. */
  async redraw(scene: Scene): Promise<void> {
    const token = ++this.loadToken;
    this.lastPoint.clear();

    this.ctx.fillStyle = BACKGROUND_COLOR;
    this.ctx.fillRect(0, 0, TABLE_CANVAS_SIZE, TABLE_CANVAS_SIZE);

    if (scene.backgroundImage) {
      const image = await loadImage(scene.backgroundImage).catch(() => null);
      if (token !== this.loadToken) {
        return; // superseded by a later redraw while the image was loading
      }
      if (image) {
        // "Cover" fit (crop the longer dimension, no stretching) rather
        // than stretching to the square canvas — a cheap stopgap for a
        // real interactive resize/reposition tool, tracked in
        // docs/roadmap.md (Milestone 8 user request).
        const rect = computeCoverRect(image.naturalWidth, image.naturalHeight, TABLE_CANVAS_SIZE);
        this.ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
      }
    }

    for (const drawing of scene.drawings) {
      this.paintStroke(drawing.points, { color: drawing.color, width: drawing.width });
    }
    this.texture.needsUpdate = true;
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
    this.texture.needsUpdate = true;
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
