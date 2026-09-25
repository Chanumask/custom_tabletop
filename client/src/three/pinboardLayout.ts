import { PINBOARD_SLOT_COUNT } from '@custom-tabletop/shared';

export const PINBOARD_COLS = 3;
export const PINBOARD_ROWS = PINBOARD_SLOT_COUNT / PINBOARD_COLS;

export interface PinboardSlotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The pixel rect of pin slot `index` (0..PINBOARD_SLOT_COUNT-1, row-major)
 * on a `canvasWidth` x `canvasHeight` canvas. Pure and Three.js-free, same
 * extraction pattern as `soundboardSlotOffset` — testable without a canvas
 * or WebGL context. Returns null for an out-of-range index.
 */
export function pinboardSlotRect(
  index: number,
  canvasWidth: number,
  canvasHeight: number,
): PinboardSlotRect | null {
  if (!Number.isInteger(index) || index < 0 || index >= PINBOARD_SLOT_COUNT) {
    return null;
  }
  const width = canvasWidth / PINBOARD_COLS;
  const height = canvasHeight / PINBOARD_ROWS;
  const row = Math.floor(index / PINBOARD_COLS);
  const col = index % PINBOARD_COLS;
  return { x: col * width, y: row * height, width, height };
}

/**
 * A small, deterministic "pinned by hand" tilt (radians) for a photo —
 * derived from its id (a stable hash, not `Math.random()`) so every
 * client's board draws the same tilt for the same photo, the same
 * "everyone sees the same seeded board" requirement the parchment/whiteboard
 * textures already follow.
 */
export function pinTilt(photoId: string): number {
  let hash = 0;
  for (let i = 0; i < photoId.length; i++) {
    hash = (hash * 31 + photoId.charCodeAt(i)) | 0;
  }
  const unit = (hash >>> 0) / 0xffffffff; // 0..1
  const maxTilt = 0.14; // radians, ~8 degrees either way
  return (unit - 0.5) * 2 * maxTilt;
}
