import { describe, expect, it } from 'vitest';
import { crickets, nightLoudness } from './nightAmbience.js';

describe('the night outside, heard inside', () => {
  it('is loudest by a window and never quite gone', () => {
    expect(nightLoudness(0)).toBe(1);
    expect(nightLoudness(2)).toBeGreaterThan(nightLoudness(4));
    expect(nightLoudness(5)).toBeCloseTo(0.22);
    expect(nightLoudness(40)).toBeCloseTo(0.22);
  });

  it('has a small chorus of crickets, each its own voice — fewer on Halloween', () => {
    let seed = 0;
    const random = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const chorus = crickets('classic', random);
    expect(chorus).toHaveLength(4);
    expect(new Set(chorus.map((cricket) => cricket.pitch)).size).toBe(4);
    for (const cricket of chorus) {
      expect(cricket.pitch).toBeGreaterThanOrEqual(3900);
      expect(cricket.pitch).toBeLessThanOrEqual(5200);
      expect(cricket.pulses).toBeGreaterThanOrEqual(2);
      expect(Math.abs(cricket.pan)).toBeLessThanOrEqual(0.8);
    }
    expect(crickets('halloween', random)).toHaveLength(2);
  });
});
