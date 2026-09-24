import type { Vector3 } from '@custom-tabletop/shared';
import type { TableSurface } from './three/RoomLayout.js';

/** Keeps a spawned die comfortably on the play surface, not at the rail. */
const SPAWN_EXTENT_FRACTION = 0.7;
/** Random spots tried per spawn; the one farthest from other dice wins. */
const SPAWN_CANDIDATES = 12;

/**
 * Picks a resting spot for a newly spawned die on the table's play surface
 * — within `SPAWN_EXTENT_FRACTION` of its half-width/depth so it never lands
 * against the rail — on the surface itself (`Dice.position` is the point
 * under the die; the client lifts each shape by its own resting height).
 * Of a few random candidates, takes the one with the most room around it,
 * so a handful of dice don't pile onto each other. Takes `Math.random` as a
 * parameter so this stays pure/seedable for tests.
 */
export function randomDiceSpawnPosition(
  table: TableSurface,
  existing: readonly Vector3[] = [],
  random: () => number = Math.random,
): Vector3 {
  const candidate = (): Vector3 => ({
    x: table.center.x + (random() * 2 - 1) * table.halfWidth * SPAWN_EXTENT_FRACTION,
    y: table.height,
    z: table.center.z + (random() * 2 - 1) * table.halfDepth * SPAWN_EXTENT_FRACTION,
  });
  if (existing.length === 0) {
    return candidate();
  }

  const clearance = (spot: Vector3) =>
    Math.min(...existing.map((other) => Math.hypot(other.x - spot.x, other.z - spot.z)));
  let best = candidate();
  let bestClearance = clearance(best);
  for (let i = 1; i < SPAWN_CANDIDATES; i++) {
    const spot = candidate();
    const room = clearance(spot);
    if (room > bestClearance) {
      best = spot;
      bestClearance = room;
    }
  }
  return best;
}
