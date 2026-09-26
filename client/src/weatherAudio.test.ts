import { describe, expect, it } from 'vitest';
import { crickets } from './nightAmbience.js';
import { throughWindow } from './spatialAudio.js';
import { rainLoudness } from './weatherAudio.js';

describe('the rain, heard inside', () => {
  it('is loudest by a window and still there across the room', () => {
    expect(rainLoudness(0, false, false)).toBe(1);
    expect(rainLoudness(1, false, false)).toBeGreaterThan(rainLoudness(3, false, false));
    expect(rainLoudness(5, false, false)).toBeCloseTo(0.3);
    expect(rainLoudness(50, false, false)).toBeCloseTo(0.3);
  });

  it('comes in louder through an open window, softer through drawn curtains', () => {
    const shut = rainLoudness(2, false, false);
    expect(rainLoudness(2, true, false)).toBeGreaterThan(shut);
    expect(rainLoudness(2, false, true)).toBeLessThan(shut);
    // Open wins: drawn curtains over an open window don't keep it out.
    expect(rainLoudness(2, true, true)).toBe(rainLoudness(2, true, false));
    expect(throughWindow(false, false)).toBe(1);
  });
});

describe('a winter night', () => {
  it('is too cold for crickets', () => {
    expect(crickets('winter', Math.random)).toEqual([]);
  });
});
