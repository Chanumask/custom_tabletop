import { describe, expect, it } from 'vitest';
import { fireLoudness } from './fireAmbience.js';

describe('fireLoudness', () => {
  it('is loudest at the fire and eases down with distance', () => {
    expect(fireLoudness(0)).toBe(1);
    expect(fireLoudness(1)).toBeGreaterThan(fireLoudness(3));
    expect(fireLoudness(3)).toBeGreaterThan(fireLoudness(6));
  });

  it('stays audible anywhere in the room — the table is 5–7 m from the fire', () => {
    for (const distanceFromTableSeat of [4.8, 5.5, 6.3, 7, 9]) {
      expect(fireLoudness(distanceFromTableSeat)).toBeGreaterThanOrEqual(0.3);
    }
  });
});
