import type { Vector3 } from '@custom-tabletop/shared';
import type { RoomLayout } from './three/RoomLayout.js';

/** Keeps a spawned die visibly on the table, not right at the rim. */
const SPAWN_RADIUS_FRACTION = 0.6;

/**
 * Picks a random resting spot for a newly spawned die, within
 * `SPAWN_RADIUS_FRACTION` of the table's radius so it doesn't spawn
 * hanging off the edge, resting on top of the table surface (`dieHeight`
 * above it — half the die's own height, so it sits on the surface rather
 * than being centered inside it). Takes `Math.random` as a parameter so
 * this stays a pure, seedable function for tests.
 */
export function randomDiceSpawnPosition(
  layout: Pick<RoomLayout, 'table' | 'tableHeight'>,
  dieHeight: number,
  random: () => number = Math.random,
): Vector3 {
  const angle = random() * Math.PI * 2;
  const distance = random() * layout.table.radius * SPAWN_RADIUS_FRACTION;

  return {
    x: layout.table.center.x + Math.cos(angle) * distance,
    y: layout.tableHeight + dieHeight / 2,
    z: layout.table.center.z + Math.sin(angle) * distance,
  };
}
