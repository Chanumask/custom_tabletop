import type { Point2D } from '@custom-tabletop/shared';

/**
 * Maps a point in the table's local space (x/z relative to its center) onto
 * pixel coordinates of the canvas texture applied to it via
 * `remapTableTopUV` — the single source of truth both share, so a raycast
 * hit on the physical table and the texture's own UV always agree on where
 * "the same spot on the table" is. The play surface's full width/depth maps
 * onto the full canvas (a square table -> a square canvas, nothing cropped).
 * Assumes the texture's `flipY` is `false` (set in `TableCanvas`), so
 * canvas-row-from-top maps directly to UV `v` with no extra inversion.
 */
export function tableLocalToCanvas(
  localX: number,
  localZ: number,
  halfWidth: number,
  halfDepth: number,
  canvasSize: number,
): Point2D {
  const u = localX / (2 * halfWidth) + 0.5;
  const v = localZ / (2 * halfDepth) + 0.5;
  return { x: u * canvasSize, y: v * canvasSize };
}

/** The inverse of `tableLocalToCanvas`: a canvas point back to the table's
 * local x/z (relative to its center) — where to show a ping in the room. */
export function canvasToTableLocal(
  point: Point2D,
  halfWidth: number,
  halfDepth: number,
  canvasSize: number,
): { x: number; z: number } {
  return {
    x: (point.x / canvasSize - 0.5) * 2 * halfWidth,
    z: (point.y / canvasSize - 0.5) * 2 * halfDepth,
  };
}

/** Where a map grid's lines fall along one side of the canvas: `cells + 1`
 * evenly spaced offsets from 0 to `canvasSize` (none when `cells` is 0). */
export function gridLineOffsets(cells: number, canvasSize: number): number[] {
  if (cells <= 0) {
    return [];
  }
  return Array.from({ length: cells + 1 }, (_, index) => (index * canvasSize) / cells);
}

/** A point on the table surface (table units, like drawings) as a spot in
 * the room, on the play surface — where a mini or a dragged die stands. */
export function canvasToWorld(
  point: Point2D,
  table: { center: { x: number; z: number }; halfWidth: number; halfDepth: number; height: number },
  canvasSize: number,
): { x: number; y: number; z: number } {
  const local = canvasToTableLocal(point, table.halfWidth, table.halfDepth, canvasSize);
  return { x: table.center.x + local.x, y: table.height, z: table.center.z + local.z };
}

/** A pixel rectangle: min inclusive, max exclusive. */
export interface PixelRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * The canvas pixels a stroke segment from `from` to `to` (logical units)
 * of `width` can touch — padded for the round cap and antialiasing, scaled
 * to pixels and kept inside the canvas. Null when it misses the canvas. What
 * `TableCanvas.flush` uploads instead of the whole texture.
 */
export function segmentPixelRect(
  from: Point2D,
  to: Point2D,
  width: number,
  scale: number,
  canvasPixels: number,
): PixelRect | null {
  const pad = width / 2 + 2;
  const clamp = (value: number) => Math.min(canvasPixels, Math.max(0, value));
  const rect = {
    minX: clamp(Math.floor((Math.min(from.x, to.x) - pad) * scale)),
    minY: clamp(Math.floor((Math.min(from.y, to.y) - pad) * scale)),
    maxX: clamp(Math.ceil((Math.max(from.x, to.x) + pad) * scale)),
    maxY: clamp(Math.ceil((Math.max(from.y, to.y) + pad) * scale)),
  };
  return rect.maxX > rect.minX && rect.maxY > rect.minY ? rect : null;
}
