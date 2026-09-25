import { describe, expect, it } from 'vitest';
import { fireLoudness } from './fireAmbience.js';

describe('fireLoudness', () => {
  it('is loudest at the fire and fades to silence by 8 m', () => {
    expect(fireLoudness(0)).toBe(1);
    expect(fireLoudness(2)).toBeGreaterThan(fireLoudness(4));
    expect(fireLoudness(4)).toBeGreaterThan(0);
    expect(fireLoudness(8)).toBe(0);
    expect(fireLoudness(20)).toBe(0);
  });
});
