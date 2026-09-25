import { SOUNDBOARD_SLOT_COUNT } from '@custom-tabletop/shared';

export const SOUNDBOARD_COLS = 4;

/** Each wall button's enamel color, one per slot (not per assigned sound),
 * so a button keeps its color whether or not it's filled — "top-left is the
 * air horn" by spot. Ordered so neighbours differ. The Sound tab's little
 * board shows the same colors. */
export const SOUNDBOARD_JEWELS = [
  0xb3243a, 0xd9861c, 0x1f9a5a, 0x2456b8, 0x7a3fb0, 0xe0b531, 0x2aa6a0, 0xc4502a, 0x2f3f9e,
  0xd0527a, 0x8cbf3a, 0x8f1f2c, 0x4cb8c8, 0x9a55d0, 0xd4c23a, 0x3aa88a,
];
export const SOUNDBOARD_ROWS = SOUNDBOARD_SLOT_COUNT / SOUNDBOARD_COLS;

/** How far apart each button sits on the wall panel, in metres — a button's
 * local (y, z) offset from the panel's own center. Pure and Three.js-free so
 * it's unit-testable without a WebGL context, the same extraction pattern
 * `nearestInteractable` (interaction.ts) and `resolveMovement` (collision.ts)
 * already use for this project's other "geometry math a mesh-building class
 * shouldn't have to re-derive" cases. */
const COL_SPACING = 0.42;
const ROW_SPACING = 0.38;

export interface SoundboardSlotOffset {
  y: number;
  z: number;
}

/**
 * The local (y, z) offset of slot `index` (0..15, row-major: 0-3 top row,
 * 4-7 next, etc.) from the wall panel's own center — `y` increases upward
 * (top row has the highest y), `z` increases along the wall. Returns null
 * for an out-of-range index rather than throwing, since a caller iterating
 * `soundboardSlots` never has one, but a hand-typed test case might.
 */
export function soundboardSlotOffset(index: number): SoundboardSlotOffset | null {
  if (!Number.isInteger(index) || index < 0 || index >= SOUNDBOARD_SLOT_COUNT) {
    return null;
  }
  const row = Math.floor(index / SOUNDBOARD_COLS);
  const col = index % SOUNDBOARD_COLS;
  const rowsFromCenter = row - (SOUNDBOARD_ROWS - 1) / 2;
  const colsFromCenter = col - (SOUNDBOARD_COLS - 1) / 2;
  return {
    y: -rowsFromCenter * ROW_SPACING,
    z: colsFromCenter * COL_SPACING,
  };
}
