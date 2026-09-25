import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { TableChairs, chairSpots, type SideSpots } from './tableChairs.js';
import type { Obstacle } from './collision.js';
import type { Seat } from './avatarMotion.js';

/** A 2 m table at the origin, chairs 1.35 m out, ±0.5 m along each side. */
const SIDES: Record<'N' | 'E' | 'S' | 'W', SideSpots> = {
  N: { first: { x: -0.5, z: -1.35 }, second: { x: 0.5, z: -1.35 }, yaw: 0 },
  S: { first: { x: 0.5, z: 1.35 }, second: { x: -0.5, z: 1.35 }, yaw: Math.PI },
  E: { first: { x: 1.35, z: -0.5 }, second: { x: 1.35, z: 0.5 }, yaw: -Math.PI / 2 },
  W: { first: { x: -1.35, z: 0.5 }, second: { x: -1.35, z: -0.5 }, yaw: Math.PI / 2 },
};

describe('chairSpots', () => {
  it('four chairs: one in the middle of each side', () => {
    const seats = chairSpots(4, SIDES);
    expect(seats).toHaveLength(4);
    for (const seat of seats) {
      expect(Math.min(Math.abs(seat.x), Math.abs(seat.z))).toBeCloseTo(0);
    }
  });

  it('five chairs: the north side gets its pair, the others stay single', () => {
    const seats = chairSpots(5, SIDES);
    expect(seats[0]).toMatchObject({ x: -0.5, z: -1.35 }); // north, first
    expect(seats[4]).toMatchObject({ x: 0.5, z: -1.35 }); // north, second
    expect(seats[1]).toMatchObject({ x: 0, z: 1.35 }); // south, alone in the middle
  });

  it('eight chairs: every side has its pair, nobody shares a spot', () => {
    const seats = chairSpots(8, SIDES);
    const keys = new Set(seats.map((seat) => `${seat.x}|${seat.z}`));
    expect(keys.size).toBe(8);
  });
});

describe('TableChairs', () => {
  function room() {
    const root = new THREE.Group();
    const obstacles: { node: THREE.Object3D; obstacle: Obstacle }[] = [];
    for (const [side, spots] of Object.entries(SIDES)) {
      for (const [index, spot] of [spots.first, spots.second].entries()) {
        const chair = new THREE.Object3D();
        chair.name = `Chair_${side}${index}`;
        chair.position.set(spot.x, 0, spot.z);
        root.add(chair);
        const collider = new THREE.Object3D();
        collider.name = `COL_Chair_${side}${index ? '001' : ''}`;
        obstacles.push({
          node: collider,
          obstacle: {
            minX: spot.x - 0.3,
            maxX: spot.x + 0.3,
            minZ: spot.z - 0.3,
            maxZ: spot.z + 0.3,
          },
        });
      }
    }
    root.updateMatrixWorld(true);
    const seats: Seat[] = [];
    const chairs = TableChairs.fromRoom(root, { x: 0, z: 0 }, obstacles, seats)!;
    return { root, obstacles, seats, chairs };
  }

  it('sets out four, moving the lone chairs to the middle with their colliders', () => {
    const { root, obstacles, seats, chairs } = room();
    chairs.apply(4);
    expect(seats).toHaveLength(4);
    const n0 = root.getObjectByName('Chair_N0')!;
    const n1 = root.getObjectByName('Chair_N1')!;
    expect(n0.visible).toBe(true);
    expect(n0.position.x).toBeCloseTo(0);
    expect(n1.visible).toBe(false);
    const north = obstacles.find(({ node }) => node.name === 'COL_Chair_N')!.obstacle;
    expect((north.minX + north.maxX) / 2).toBeCloseTo(0);
    const gone = obstacles.find(({ node }) => node.name === 'COL_Chair_N001')!.obstacle;
    expect(gone.minX).toBeGreaterThan(1000);
  });

  it('grows back to eight and shrinks again, in place', () => {
    const { root, seats, chairs } = room();
    chairs.apply(8);
    expect(seats).toHaveLength(8);
    expect(root.getObjectByName('Chair_W1')!.visible).toBe(true);
    expect(root.getObjectByName('Chair_N0')!.position.x).toBeCloseTo(-0.5);
    chairs.apply(5);
    expect(seats).toHaveLength(5);
    expect(root.getObjectByName('Chair_N1')!.visible).toBe(true);
    expect(root.getObjectByName('Chair_S1')!.visible).toBe(false);
  });
});
