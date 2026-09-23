import type { Point2D } from '@custom-tabletop/shared';

/**
 * Maps a point in the table's local space (x/z relative to its center) onto
 * pixel coordinates of the canvas texture applied to it via
 * `remapTableTopUV` — the single source of truth both share, so a raycast
 * hit on the physical table and the texture's own UV always agree on where
 * "the same spot on the table" is. Assumes the texture's `flipY` is `false`
 * (set in `TableCanvas`), so canvas-row-from-top maps directly to UV `v`
 * with no extra inversion.
 */
export function tableLocalToCanvas(
  localX: number,
  localZ: number,
  radius: number,
  canvasSize: number,
): Point2D {
  const u = localX / (2 * radius) + 0.5;
  const v = localZ / (2 * radius) + 0.5;
  return { x: u * canvasSize, y: v * canvasSize };
}
