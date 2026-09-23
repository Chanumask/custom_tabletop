import { describe, expect, it } from 'vitest';
import { resolveMovement, type RoomBounds, type TableBounds } from './collision.js';

const room: RoomBounds = { minX: -5, maxX: 5, minZ: -4, maxZ: 4 };
const table: TableBounds = { center: { x: 0, z: 0 }, radius: 1 };
const RADIUS = 0.3;

describe('resolveMovement', () => {
  it('applies a small movement unobstructed by anything', () => {
    const result = resolveMovement({ x: 3, z: 0 }, { x: 0.5, z: 0 }, room, table, RADIUS);
    expect(result).toEqual({ x: 3.5, z: 0 });
  });

  it('does not move when the delta is zero and the position is already valid', () => {
    const result = resolveMovement({ x: 2, z: 2 }, { x: 0, z: 0 }, room, table, RADIUS);
    expect(result).toEqual({ x: 2, z: 2 });
  });

  it('stops at the east wall instead of passing through it', () => {
    const result = resolveMovement({ x: 4.5, z: 0 }, { x: 2, z: 0 }, room, table, RADIUS);
    expect(result.x).toBeCloseTo(room.maxX - RADIUS);
    expect(result.z).toBeCloseTo(0);
  });

  it('stops at the west wall instead of passing through it', () => {
    const result = resolveMovement({ x: -4.5, z: 0 }, { x: -2, z: 0 }, room, table, RADIUS);
    expect(result.x).toBeCloseTo(room.minX + RADIUS);
  });

  it('stops at the north wall (minZ) instead of passing through it', () => {
    const result = resolveMovement({ x: 0, z: -3.5 }, { x: 0, z: -2 }, room, table, RADIUS);
    expect(result.z).toBeCloseTo(room.minZ + RADIUS);
  });

  it('stops at the south wall (maxZ) instead of passing through it', () => {
    const result = resolveMovement({ x: 0, z: 3.5 }, { x: 0, z: 2 }, room, table, RADIUS);
    expect(result.z).toBeCloseTo(room.maxZ - RADIUS);
  });

  it('clamps into a corner on a diagonal move toward two walls at once', () => {
    const result = resolveMovement({ x: 4, z: 3 }, { x: 2, z: 2 }, room, table, RADIUS);
    expect(result.x).toBeCloseTo(room.maxX - RADIUS);
    expect(result.z).toBeCloseTo(room.maxZ - RADIUS);
  });

  it("can't walk straight into the table from the south", () => {
    const result = resolveMovement({ x: 0, z: -3 }, { x: 0, z: 2.5 }, room, table, RADIUS);
    const distanceFromCenter = Math.hypot(result.x - table.center.x, result.z - table.center.z);
    expect(distanceFromCenter).toBeGreaterThanOrEqual(table.radius + RADIUS - 1e-9);
  });

  it("can't walk straight into the table from the east", () => {
    const result = resolveMovement({ x: 3, z: 0 }, { x: -2.5, z: 0 }, room, table, RADIUS);
    const distanceFromCenter = Math.hypot(result.x - table.center.x, result.z - table.center.z);
    expect(distanceFromCenter).toBeGreaterThanOrEqual(table.radius + RADIUS - 1e-9);
  });

  it("can't walk straight into the table from the north-west diagonal", () => {
    const result = resolveMovement({ x: -3, z: -3 }, { x: 2.2, z: 2.2 }, room, table, RADIUS);
    const distanceFromCenter = Math.hypot(result.x - table.center.x, result.z - table.center.z);
    expect(distanceFromCenter).toBeGreaterThanOrEqual(table.radius + RADIUS - 1e-9);
  });

  it('slides along the table: an X-blocked step still allows the free Z component through', () => {
    // Just outside the table to the east (distance 1.35 > radius+playerRadius
    // 1.3). Moving further toward the table on X alone would collide, but Z
    // is wide open — the player should still be carried along Z rather than
    // freezing entirely because one axis was blocked.
    const start = { x: 1.35, z: 0 };
    const result = resolveMovement(start, { x: -0.1, z: 1 }, room, table, RADIUS);
    expect(result.x).toBeCloseTo(1.35);
    expect(result.z).toBeCloseTo(1);
  });

  it('corrects an already-overlapping starting position even with zero movement', () => {
    const result = resolveMovement({ x: 0.2, z: 0 }, { x: 0, z: 0 }, room, table, RADIUS);
    const distanceFromCenter = Math.hypot(result.x - table.center.x, result.z - table.center.z);
    expect(distanceFromCenter).toBeGreaterThanOrEqual(table.radius + RADIUS - 1e-9);
  });

  it('corrects an already-out-of-bounds starting position even with zero movement', () => {
    const result = resolveMovement({ x: 6, z: 0 }, { x: 0, z: 0 }, room, table, RADIUS);
    expect(result.x).toBeCloseTo(room.maxX - RADIUS);
  });
});
