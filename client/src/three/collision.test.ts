import { describe, expect, it } from 'vitest';
import { isClear, resolveMovement, type Obstacle, type RoomBounds } from './collision.js';

const room: RoomBounds = { minX: -5, maxX: 5, minZ: -4, maxZ: 4 };
const table: Obstacle = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
const shelf: Obstacle = { minX: 3, maxX: 4, minZ: -4, maxZ: -3.4 };
const obstacles = [table, shelf];
const RADIUS = 0.3;

describe('resolveMovement', () => {
  it('applies a small movement unobstructed by anything', () => {
    const result = resolveMovement({ x: 3, z: 0 }, { x: 0.5, z: 0 }, room, obstacles, RADIUS);
    expect(result).toEqual({ x: 3.5, z: 0 });
  });

  it('does not move when the delta is zero and the position is already valid', () => {
    const result = resolveMovement({ x: 2, z: 2 }, { x: 0, z: 0 }, room, obstacles, RADIUS);
    expect(result).toEqual({ x: 2, z: 2 });
  });

  it('stops at the east wall instead of passing through it', () => {
    const result = resolveMovement({ x: 4.5, z: 0 }, { x: 2, z: 0 }, room, obstacles, RADIUS);
    expect(result.x).toBeCloseTo(room.maxX - RADIUS);
    expect(result.z).toBeCloseTo(0);
  });

  it('stops at the west wall instead of passing through it', () => {
    const result = resolveMovement({ x: -4.5, z: 0 }, { x: -2, z: 0 }, room, obstacles, RADIUS);
    expect(result.x).toBeCloseTo(room.minX + RADIUS);
  });

  it('stops at the north wall (minZ) and the south wall (maxZ)', () => {
    expect(
      resolveMovement({ x: 0, z: -3.5 }, { x: 0, z: -2 }, room, obstacles, RADIUS).z,
    ).toBeCloseTo(room.minZ + RADIUS);
    expect(
      resolveMovement({ x: 0, z: 3.5 }, { x: 0, z: 2 }, room, obstacles, RADIUS).z,
    ).toBeCloseTo(room.maxZ - RADIUS);
  });

  it('clamps into a corner on a diagonal move toward two walls at once', () => {
    const result = resolveMovement({ x: -4, z: 3 }, { x: -2, z: 2 }, room, obstacles, RADIUS);
    expect(result.x).toBeCloseTo(room.minX + RADIUS);
    expect(result.z).toBeCloseTo(room.maxZ - RADIUS);
  });

  it("can't walk straight into the table from the south, the east, or diagonally", () => {
    for (const [start, delta] of [
      [
        { x: 0, z: 3 },
        { x: 0, z: -2.5 },
      ],
      [
        { x: 3, z: 0 },
        { x: -2.5, z: 0 },
      ],
      [
        { x: -3, z: -3 },
        { x: 2.2, z: 2.2 },
      ],
    ] as const) {
      expect(isClear(resolveMovement(start, delta, room, obstacles, RADIUS), [table], RADIUS)).toBe(
        true,
      );
    }
  });

  it('stops flush against the table edge, not short of it', () => {
    const result = resolveMovement({ x: 0, z: 3 }, { x: 0, z: -2 }, room, obstacles, RADIUS);
    // A single step that would end inside the table is refused, but the
    // player can then approach to within a hair of the edge in small steps.
    expect(result.z).toBe(3);
    const close = resolveMovement({ x: 0, z: 1.35 }, { x: 0, z: -0.04 }, room, obstacles, RADIUS);
    expect(close.z).toBeCloseTo(1.31);
  });

  it('slides along the table: an X-blocked step still carries the free Z component', () => {
    // Just east of the table's edge (1 + 0.3 radius = 1.3). Pushing further
    // west would collide, but Z is wide open.
    const result = resolveMovement({ x: 1.35, z: 0 }, { x: -0.1, z: 1 }, room, obstacles, RADIUS);
    expect(result.x).toBeCloseTo(1.35);
    expect(result.z).toBeCloseTo(1);
  });

  it('can walk diagonally past a table corner it only grazes', () => {
    // Outside the corner's rounded reach (distance from (1,1) > 0.3), so the
    // circle-vs-box test must not treat the empty corner region as solid.
    const result = resolveMovement(
      { x: 1.25, z: 1.25 },
      { x: 0.05, z: 0.05 },
      room,
      obstacles,
      RADIUS,
    );
    expect(result).toEqual({ x: 1.3, z: 1.3 });
  });

  it('collides with every obstacle, not just the table', () => {
    const result = resolveMovement({ x: 3.5, z: -2.5 }, { x: 0, z: -1 }, room, obstacles, RADIUS);
    expect(isClear(result, [shelf], RADIUS)).toBe(true);
  });

  it('corrects a starting position inside furniture even with zero movement', () => {
    const result = resolveMovement({ x: 0.9, z: 0.2 }, { x: 0, z: 0 }, room, obstacles, RADIUS);
    expect(isClear(result, [table], RADIUS)).toBe(true);
    // Exits through the nearest face (east, 0.1 away), not across the table.
    expect(result.x).toBeCloseTo(1.3);
  });

  it('corrects an already-out-of-bounds starting position even with zero movement', () => {
    const result = resolveMovement({ x: 6, z: 0 }, { x: 0, z: 0 }, room, obstacles, RADIUS);
    expect(result.x).toBeCloseTo(room.maxX - RADIUS);
  });

  it('behaves like a plain walled room with no obstacles at all', () => {
    expect(resolveMovement({ x: 0, z: 0 }, { x: 0.5, z: 0.5 }, room, [], RADIUS)).toEqual({
      x: 0.5,
      z: 0.5,
    });
  });
});
