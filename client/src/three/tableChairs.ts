import * as THREE from 'three';
import { SEAT_SLOTS, sideHasTwo, type TableSide } from '@custom-tabletop/shared';
import type { Obstacle } from './collision.js';
import type { Seat } from './avatarMotion.js';

/** One side of the table: where its two chairs stand when it has two, and
 * which way someone sitting there faces. */
export interface SideSpots {
  first: { x: number; z: number };
  second: { x: number; z: number };
  yaw: number;
}

/**
 * Where each chair of a table with `count` chairs stands (docs/decisions.md,
 * "Chairs"), indexed by seat: a side with two chairs has them on its two
 * spots, a side with one has it in the middle. Pure.
 */
export function chairSpots(count: number, sides: Record<TableSide, SideSpots>): Seat[] {
  return SEAT_SLOTS.slice(0, count).map(({ side, second }) => {
    const spots = sides[side];
    const at = sideHasTwo(side, count)
      ? second
        ? spots.second
        : spots.first
      : { x: (spots.first.x + spots.second.x) / 2, z: (spots.first.z + spots.second.z) / 2 };
    return { x: at.x, z: at.z, yaw: spots.yaw };
  });
}

interface Chair {
  node: THREE.Object3D;
  home: THREE.Vector3;
  /** Its footprint in the room's obstacle list, and where that was at home. */
  collider: Obstacle | null;
  colliderHome: Obstacle | null;
}

/** A footprint nothing ever bumps into — a hidden chair's collider. */
const NOWHERE: Obstacle = { minX: 1e6, maxX: 1e6, minZ: 1e6, maxZ: 1e6 };

/**
 * The room model's eight chairs (`Chair_{N,E,S,W}{0,1}`), set out for however
 * many the table has: moves and hides them, moves their colliders with
 * them, and keeps `seats` (the list everything else reads) current — all
 * in place, so whoever holds those arrays sees the change.
 */
export class TableChairs {
  private count = 0;

  constructor(
    private readonly sides: Record<TableSide, { spots: SideSpots; chairs: [Chair, Chair] }>,
    private readonly seats: Seat[],
  ) {}

  /** Finds the pairs in a room model; null unless all eight are there. */
  static fromRoom(
    root: THREE.Object3D,
    tableCenter: { x: number; z: number },
    obstacles: { node: THREE.Object3D; obstacle: Obstacle }[],
    seats: Seat[],
  ): TableChairs | null {
    const found = new Map<string, THREE.Object3D>();
    root.traverse((node) => {
      const match = /^Chair_([NESW])([01])$/.exec(node.name);
      if (match) found.set(`${match[1]}${match[2]}`, node);
    });
    if (found.size !== 8) return null;

    const chairColliders = obstacles.filter(({ node }) => node.name.startsWith('COL_Chair'));
    const claimed = new Set<Obstacle>();
    const chairAt = (node: THREE.Object3D): Chair => {
      const home = node.getWorldPosition(new THREE.Vector3());
      // Its collider: the nearest chair footprint not yet claimed.
      let best: Obstacle | null = null;
      let bestDistance = Infinity;
      for (const { obstacle } of chairColliders) {
        if (claimed.has(obstacle)) continue;
        const distance = Math.hypot(
          (obstacle.minX + obstacle.maxX) / 2 - home.x,
          (obstacle.minZ + obstacle.maxZ) / 2 - home.z,
        );
        if (distance < bestDistance && distance < 0.5) {
          best = obstacle;
          bestDistance = distance;
        }
      }
      if (best) claimed.add(best);
      return { node, home, collider: best, colliderHome: best ? { ...best } : null };
    };

    const sides = {} as Record<TableSide, { spots: SideSpots; chairs: [Chair, Chair] }>;
    for (const side of ['N', 'E', 'S', 'W'] as const) {
      const first = chairAt(found.get(`${side}0`)!);
      const second = chairAt(found.get(`${side}1`)!);
      // Facing straight across the side (two chairs to a side facing the
      // table's centre would angle inward).
      const mid = first.home.clone().add(second.home).multiplyScalar(0.5);
      const dx = tableCenter.x - mid.x;
      const dz = tableCenter.z - mid.z;
      const yaw = Math.abs(dz) >= Math.abs(dx) ? Math.atan2(0, dz) : Math.atan2(dx, 0);
      sides[side] = {
        spots: {
          first: { x: first.home.x, z: first.home.z },
          second: { x: second.home.x, z: second.home.z },
          yaw,
        },
        chairs: [first, second],
      };
    }
    return new TableChairs(sides, seats);
  }

  /** How many chairs are out right now. */
  get size(): number {
    return this.count;
  }

  /** Sets out `count` chairs. */
  apply(count: number): void {
    if (count === this.count) return;
    this.count = count;
    for (const side of ['N', 'E', 'S', 'W'] as const) {
      const { spots, chairs } = this.sides[side];
      const two = sideHasTwo(side, count);
      const [first, second] = chairs;
      const firstAt = two
        ? spots.first
        : { x: (spots.first.x + spots.second.x) / 2, z: (spots.first.z + spots.second.z) / 2 };
      place(first, firstAt.x, firstAt.z, true);
      place(second, spots.second.x, spots.second.z, two);
    }
    const spots = chairSpots(
      count,
      Object.fromEntries(
        Object.entries(this.sides).map(([side, { spots }]) => [side, spots]),
      ) as Record<TableSide, SideSpots>,
    );
    this.seats.length = 0;
    this.seats.push(...spots);
  }
}

function place(chair: Chair, x: number, z: number, visible: boolean): void {
  chair.node.visible = visible;
  const target = new THREE.Vector3(x, chair.home.y, z);
  chair.node.position.copy(chair.node.parent ? chair.node.parent.worldToLocal(target) : target);
  if (chair.collider && chair.colliderHome) {
    const home = chair.colliderHome;
    const next = visible
      ? {
          minX: home.minX + (x - chair.home.x),
          maxX: home.maxX + (x - chair.home.x),
          minZ: home.minZ + (z - chair.home.z),
          maxZ: home.maxZ + (z - chair.home.z),
        }
      : NOWHERE;
    Object.assign(chair.collider, next);
  }
}
