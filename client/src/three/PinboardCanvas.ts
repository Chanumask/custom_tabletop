import * as THREE from 'three';
import type { Photo } from '@custom-tabletop/shared';
import { pinboardSlotRect, pinTilt, PINBOARD_COLS, PINBOARD_ROWS } from './pinboardLayout.js';

const WIDTH = 960;
const HEIGHT = Math.round((WIDTH / PINBOARD_COLS) * PINBOARD_ROWS);
const CORK_COLOR = '#c9a877';
const CELL_PADDING = 20;
/** The white polaroid-style border around each photo; extra at the bottom,
 * the classic instant-photo caption strip. */
const BORDER = 12;
const BOTTOM_STRIP = 24;
const PIN_COLOR = '#8a1f1f';

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load photo: ${url}`));
    image.src = url;
  });
}

/**
 * The wall pinboard's photos, painted onto one canvas texture (the
 * `PinboardCanvas`/wall-mesh split every other room texture uses —
 * `WhiteboardCanvas`, `TableCanvas`) — up to `PINBOARD_SLOT_COUNT` photos,
 * each as a small tilted polaroid pinned to cork. Read-only: unlike the
 * whiteboard, nobody writes directly on this board — it only ever reflects
 * `GameState.photos` (gadgets phase 2's camera).
 */
export class PinboardCanvas {
  readonly texture: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  /** Loaded images, keyed by URL — kept across redraws so a photo already
   * on the board doesn't re-fetch every time another one is added. */
  private readonly images = new Map<string, HTMLImageElement>();
  private shown = '';

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D canvas context unavailable');
    }
    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    // Unlike WhiteboardCanvas (mapped onto a glTF mesh with non-flipped
    // UVs), this texture goes on a plain THREE.BoxGeometry, which expects
    // the default (flipped) orientation — no flipY override here.
    this.paint([]);
  }

  /** Redraws for the given photos, kicking off a load for any not already
   * cached — the load's own completion triggers a follow-up repaint so a
   * slow image doesn't block the rest of the board from showing. */
  draw(photos: Photo[]): void {
    const key = photos.map((photo) => photo.id).join(',');
    if (key === this.shown) {
      return;
    }
    this.shown = key;
    for (const photo of photos) {
      if (!this.images.has(photo.url)) {
        loadImage(photo.url)
          .then((image) => {
            this.images.set(photo.url, image);
            this.paint(photos);
          })
          .catch(() => {
            // A broken/unreachable photo just stays a blank slot.
          });
      }
    }
    this.paint(photos);
  }

  private paint(photos: Photo[]): void {
    const ctx = this.ctx;
    ctx.fillStyle = CORK_COLOR;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    // A whisper of cork speckling, seeded (not Math.random) so every
    // client paints the identical board, the same reasoning the
    // parchment/whiteboard textures already follow.
    ctx.fillStyle = 'rgba(90, 60, 20, 0.08)';
    for (let i = 0; i < 60; i += 1) {
      const seed = i * 977;
      const x = (seed % WIDTH) + (i % 7);
      const y = ((seed * 31) % HEIGHT) + (i % 5);
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    photos.forEach((photo, index) => {
      const rect = pinboardSlotRect(index, WIDTH, HEIGHT);
      if (!rect) {
        return;
      }
      const image = this.images.get(photo.url) ?? null;
      const photoSize = Math.min(rect.width, rect.height) - CELL_PADDING * 2 - BORDER * 2;
      const frameWidth = photoSize + BORDER * 2;
      const frameHeight = photoSize + BORDER * 2 + BOTTOM_STRIP;
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(pinTilt(photo.id));

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 5;
      ctx.fillStyle = '#f5f1e6';
      ctx.fillRect(-frameWidth / 2, -frameHeight / 2, frameWidth, frameHeight);
      ctx.restore();

      const photoTop = -frameHeight / 2 + BORDER;
      if (image) {
        ctx.drawImage(image, -photoSize / 2, photoTop, photoSize, photoSize);
      } else {
        ctx.fillStyle = '#d9d0bc';
        ctx.fillRect(-photoSize / 2, photoTop, photoSize, photoSize);
      }

      ctx.beginPath();
      ctx.fillStyle = PIN_COLOR;
      ctx.arc(0, -frameHeight / 2 - 3, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
