import type { Vector3 } from '@custom-tabletop/shared';
import type { TableSurface } from './three/RoomLayout.js';

/** Keeps a spawned die comfortably on the play surface, not at the rail. */
const SPAWN_EXTENT_FRACTION = 0.7;

/**
 * Picks a random resting spot for a newly spawned die on the table's play
 * surface — within `SPAWN_EXTENT_FRACTION` of its half-width/depth so it
 * never lands against the rail — resting on top of the surface (half the
 * die's own height above it, so it sits on it rather than inside it).
 * Takes `Math.random` as a parameter so this stays pure/seedable for tests.
 */
export function randomDiceSpawnPosition(
  table: TableSurface,
  dieHeight: number,
  random: () => number = Math.random,
): Vector3 {
  return {
    x: table.center.x + (random() * 2 - 1) * table.halfWidth * SPAWN_EXTENT_FRACTION,
    y: table.height + dieHeight / 2,
    z: table.center.z + (random() * 2 - 1) * table.halfDepth * SPAWN_EXTENT_FRACTION,
  };
}
