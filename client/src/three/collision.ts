export interface Vector2 {
  x: number;
  z: number;
}

export interface RoomBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** A solid floor footprint (XZ, axis-aligned) the player can't walk into —
 * the table, chairs, bookshelf, ... In the real room these come straight
 * from the Blender export's `COL_*` boxes (RoomLoader.ts), so furniture
 * collision stays in sync with the model instead of being hand-typed here. */
export interface Obstacle {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Whether a circle of `radius` at (x, z) overlaps the obstacle's box. */
function overlaps(x: number, z: number, obstacle: Obstacle, radius: number): boolean {
  const nearestX = clamp(x, obstacle.minX, obstacle.maxX);
  const nearestZ = clamp(z, obstacle.minZ, obstacle.maxZ);
  const dx = x - nearestX;
  const dz = z - nearestZ;
  return dx * dx + dz * dz < radius * radius;
}

function overlapsAny(x: number, z: number, obstacles: Obstacle[], radius: number): boolean {
  return obstacles.some((obstacle) => overlaps(x, z, obstacle, radius));
}

/** Moves a circle out of an obstacle it overlaps, by the shortest route. */
function pushOut(position: Vector2, obstacle: Obstacle, radius: number): Vector2 {
  const { x, z } = position;
  const inside = x > obstacle.minX && x < obstacle.maxX && z > obstacle.minZ && z < obstacle.maxZ;
  if (inside) {
    // Center is inside the box: exit through the nearest face.
    const exits = [
      { x: obstacle.minX - radius, z, cost: x - obstacle.minX },
      { x: obstacle.maxX + radius, z, cost: obstacle.maxX - x },
      { x, z: obstacle.minZ - radius, cost: z - obstacle.minZ },
      { x, z: obstacle.maxZ + radius, cost: obstacle.maxZ - z },
    ];
    const best = exits.reduce((a, b) => (b.cost < a.cost ? b : a));
    return { x: best.x, z: best.z };
  }
  const nearestX = clamp(x, obstacle.minX, obstacle.maxX);
  const nearestZ = clamp(z, obstacle.minZ, obstacle.maxZ);
  const dx = x - nearestX;
  const dz = z - nearestZ;
  const distance = Math.hypot(dx, dz);
  if (distance >= radius || distance === 0) {
    return position;
  }
  const scale = radius / distance;
  return { x: nearestX + dx * scale, z: nearestZ + dz * scale };
}

/**
 * Resolves an intended movement delta against the room's rectangular walls
 * and every obstacle footprint, treating the player as a circle of
 * `playerRadius`. Movement is resolved one axis at a time (X then Z), which
 * is what lets the player slide along a wall or a piece of furniture
 * instead of stopping dead the instant either axis alone would collide.
 *
 * Pure and framework-independent on purpose: this is the one part of the
 * movement engine that's practically unit-testable (Three.js
 * rendering/pointer-lock is not), so the whole collision contract lives here.
 */
export function resolveMovement(
  position: Vector2,
  delta: Vector2,
  room: RoomBounds,
  obstacles: Obstacle[],
  playerRadius: number,
): Vector2 {
  let { x, z } = position;

  const candidateX = clamp(x + delta.x, room.minX + playerRadius, room.maxX - playerRadius);
  if (!overlapsAny(candidateX, z, obstacles, playerRadius)) {
    x = candidateX;
  }

  const candidateZ = clamp(z + delta.z, room.minZ + playerRadius, room.maxZ - playerRadius);
  if (!overlapsAny(x, candidateZ, obstacles, playerRadius)) {
    z = candidateZ;
  }

  // Safety net: correct an already-invalid position (a spawn point inside
  // furniture, or floating-point creep) rather than leaving the player stuck.
  let resolved = {
    x: clamp(x, room.minX + playerRadius, room.maxX - playerRadius),
    z: clamp(z, room.minZ + playerRadius, room.maxZ - playerRadius),
  };
  for (const obstacle of obstacles) {
    if (overlaps(resolved.x, resolved.z, obstacle, playerRadius)) {
      resolved = pushOut(resolved, obstacle, playerRadius);
    }
  }
  return {
    x: clamp(resolved.x, room.minX + playerRadius, room.maxX - playerRadius),
    z: clamp(resolved.z, room.minZ + playerRadius, room.maxZ - playerRadius),
  };
}

/** Whether a circle at `position` is clear of every obstacle (test helper
 * and a sanity check for spawn points). */
export function isClear(position: Vector2, obstacles: Obstacle[], playerRadius: number): boolean {
  return !overlapsAny(position.x, position.z, obstacles, playerRadius - 1e-9);
}
