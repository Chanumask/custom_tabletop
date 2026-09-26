import { describe, expect, it } from 'vitest';
import {
  CAT_NAP_MS,
  CAT_SPOTS,
  catFloorObstacle,
  catPath,
  catPathFrom,
  catTarget,
  RING,
  scheduledSpot,
  type CatSpotId,
} from './catRoutes.js';

const SPOTS = Object.keys(CAT_SPOTS) as CatSpotId[];

describe('where the cat is', () => {
  it('is the same for everyone at the same moment, for a whole nap', () => {
    const start = 1_000 * CAT_NAP_MS;
    expect(scheduledSpot(start)).toBe(scheduledSpot(start + CAT_NAP_MS - 1));
    expect(scheduledSpot(start + 12_345)).toBe(scheduledSpot(start + 12_345));
  });

  it('visits every spot over a day, and the fire most of all', () => {
    const counts = new Map<CatSpotId, number>();
    for (let nap = 0; nap < 2000; nap++) {
      const spot = scheduledSpot(nap * CAT_NAP_MS);
      counts.set(spot, (counts.get(spot) ?? 0) + 1);
    }
    for (const spot of SPOTS) expect(counts.get(spot) ?? 0).toBeGreaterThan(200);
    expect(counts.get('fire')!).toBe(Math.max(...counts.values()));
  });

  it('goes back to the fire when someone sits where it meant to nap', () => {
    const sofaNap = Array.from({ length: 200 }, (_, nap) => nap * CAT_NAP_MS).find(
      (time) => scheduledSpot(time) === 'sofa',
    )!;
    expect(catTarget(sofaNap, [])).toBe('sofa');
    expect(catTarget(sofaNap, [{ lounge: 'sofa-middle' }])).toBe('sofa');
    expect(catTarget(sofaNap, [{ lounge: 'sofa-east' }])).toBe('fire');
  });
});

describe('the way the cat walks', () => {
  it('goes from spot to spot: down, round the table, up', () => {
    for (const from of SPOTS) {
      for (const to of SPOTS) {
        const path = catPath(from, to);
        expect(path[0]).toMatchObject({ x: CAT_SPOTS[from].x, z: CAT_SPOTS[from].z });
        expect(path.at(-1)).toMatchObject({
          x: CAT_SPOTS[to].x,
          y: CAT_SPOTS[to].y,
          z: CAT_SPOTS[to].z,
        });
        if (from === to) expect(path).toHaveLength(1);
        // Up onto a raised spot is a jump; along the floor, never above it.
        if (CAT_SPOTS[to].y > 0.1 && from !== to) expect(path.at(-1)!.jump).toBe(true);
        for (const point of path.slice(1, -1)) expect(point.y).toBeLessThan(0.1);
      }
    }
  });

  it('never cuts across the table', () => {
    const table = 1.12 + 0.15;
    for (const from of SPOTS) {
      for (const to of SPOTS) {
        const path = catPath(from, to);
        for (let i = 1; i < path.length; i++) {
          for (let t = 0; t <= 1; t += 0.05) {
            const x = path[i - 1]!.x + (path[i]!.x - path[i - 1]!.x) * t;
            const z = path[i - 1]!.z + (path[i]!.z - path[i - 1]!.z) * t;
            expect(Math.abs(x) < table && Math.abs(z) < table).toBe(false);
          }
        }
      }
    }
  });

  it('takes the short way round the ring', () => {
    // The fire (west) to the armchair (south-west): one step, not seven.
    const path = catPath('fire', 'armchair');
    const onRing = path.filter((point) =>
      RING.some((ring) => ring.x === point.x && ring.z === point.z),
    );
    expect(onRing).toHaveLength(2);
  });
});

describe('changing course and getting in the way', () => {
  it('goes on from partway, round the ring, up onto the new spot', () => {
    const path = catPathFrom({ x: 1.2, z: -2.3 }, 'armchair');
    expect(path[0]).toMatchObject({ x: 1.2, z: -2.3 });
    expect(path.at(-1)).toMatchObject({ x: CAT_SPOTS.armchair.x, z: CAT_SPOTS.armchair.z });
    expect(path.at(-1)!.jump).toBe(true);
  });

  it('is in the way only asleep on the floor', () => {
    expect(catFloorObstacle('fire')).not.toBeNull();
    expect(catFloorObstacle('sofa')).toBeNull();
    expect(catFloorObstacle('armchair')).toBeNull();
  });
});
