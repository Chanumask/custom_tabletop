import { describe, expect, it } from 'vitest';
import { LOUNGE_SEATS } from '@custom-tabletop/shared';
import { LOUNGE_SPOTS, loungeEye, sitterOn } from './loungeSeats.js';

describe('the seats away from the table', () => {
  it('has a spot for every seat, the sofa three side by side', () => {
    expect(Object.keys(LOUNGE_SPOTS).sort()).toEqual([...LOUNGE_SEATS].sort());
    const sofa = [
      LOUNGE_SPOTS['sofa-west'],
      LOUNGE_SPOTS['sofa-middle'],
      LOUNGE_SPOTS['sofa-east'],
    ];
    for (let i = 1; i < sofa.length; i++) {
      expect(sofa[i]!.x - sofa[i - 1]!.x).toBeGreaterThan(0.55);
      expect(sofa[i]!.z).toBe(sofa[0]!.z);
    }
  });

  it('puts the eyes low over the seat, leaning back a little', () => {
    for (const spot of Object.values(LOUNGE_SPOTS)) {
      const eye = loungeEye(spot);
      expect(eye.y).toBeGreaterThan(1.05);
      expect(eye.y).toBeLessThan(1.25);
      // Within a hand or so of the hips on the floor plan.
      expect(Math.hypot(eye.x - spot.x, eye.z - spot.z)).toBeLessThan(0.15);
    }
  });

  it('swings the eyes forward and back as the rocking chair rocks', () => {
    const spot = LOUNGE_SPOTS['rocking-chair'];
    const along = (eye: { x: number; z: number }) =>
      (eye.x - spot.x) * Math.sin(spot.yaw) + (eye.z - spot.z) * Math.cos(spot.yaw);
    const still = loungeEye(spot);
    const forward = loungeEye(spot, 0.07);
    const back = loungeEye(spot, -0.07);
    expect(along(forward)).toBeGreaterThan(along(still) + 0.05);
    expect(along(back)).toBeLessThan(along(still) - 0.05);
    expect(Math.abs(forward.y - still.y)).toBeLessThan(0.02);
  });

  it('knows who is sitting where', () => {
    const players = [
      { id: 'a', name: 'Alice', lounge: 'armchair' as const },
      { id: 'b', name: 'Bob', lounge: null },
    ];
    expect(sitterOn('armchair', players)?.name).toBe('Alice');
    expect(sitterOn('sofa-east', players)).toBeNull();
  });
});
