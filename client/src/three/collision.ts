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

export interface TableBounds {
  center: Vector2;
  radius: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function overlapsTable(x: number, z: number, table: TableBounds, radius: number): boolean {
  const dx = x - table.center.x;
  const dz = z - table.center.z;
  return Math.hypot(dx, dz) < table.radius + radius;
}

function pushOutOfTable(position: Vector2, table: TableBounds, radius: number): Vector2 {
  const dx = position.x - table.center.x;
  const dz = position.z - table.center.z;
  const distance = Math.hypot(dx, dz);
  const minDistance = table.radius + radius;

  if (distance >= minDistance) {
    return position;
  }

  if (distance === 0) {
    // Degenerate case: sitting exactly on the table's center. Push along an
    // arbitrary fixed direction rather than dividing by zero.
    return { x: table.center.x + minDistance, z: table.center.z };
  }

  const scale = minDistance / distance;
  return { x: table.center.x + dx * scale, z: table.center.z + dz * scale };
}

/**
 * Resolves an intended movement delta against the room's rectangular walls
 * and the table's circular footprint, treating the player as a circle of
 * `playerRadius`. Movement is resolved one axis at a time (X then Z), which
 * is what lets the player slide along a wall or around the table instead of
 * stopping dead the instant either axis alone would collide.
 *
 * Pure and framework-independent on purpose: this is the one part of the
 * movement engine that's practically unit-testable (Three.js
 * rendering/pointer-lock is not), so the whole collision contract lives here.
 */
export function resolveMovement(
  position: Vector2,
  delta: Vector2,
  room: RoomBounds,
  table: TableBounds,
  playerRadius: number,
): Vector2 {
  let { x, z } = position;

  const candidateX = clamp(x + delta.x, room.minX + playerRadius, room.maxX - playerRadius);
  if (!overlapsTable(candidateX, z, table, playerRadius)) {
    x = candidateX;
  }

  const candidateZ = clamp(z + delta.z, room.minZ + playerRadius, room.maxZ - playerRadius);
  if (!overlapsTable(x, candidateZ, table, playerRadius)) {
    z = candidateZ;
  }

  // Safety net: correct an already-invalid starting position (e.g. a spawn
  // point inside a wall/table, or floating-point creep across many frames)
  // rather than leaving the player stuck there.
  x = clamp(x, room.minX + playerRadius, room.maxX - playerRadius);
  z = clamp(z, room.minZ + playerRadius, room.maxZ - playerRadius);
  return pushOutOfTable({ x, z }, table, playerRadius);
}
