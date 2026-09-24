import { describe, expect, it } from 'vitest';
import { soundboardSlotOffset } from './soundboardLayout.js';

describe('soundboardSlotOffset', () => {
  it('returns null for an out-of-range or non-integer index', () => {
    expect(soundboardSlotOffset(-1)).toBeNull();
    expect(soundboardSlotOffset(16)).toBeNull();
    expect(soundboardSlotOffset(2.5)).toBeNull();
  });

  it('places slot 0 at the top-left', () => {
    const topLeft = soundboardSlotOffset(0);
    const topRight = soundboardSlotOffset(3);
    const bottomLeft = soundboardSlotOffset(12);
    expect(topLeft).not.toBeNull();
    expect(topRight).not.toBeNull();
    expect(bottomLeft).not.toBeNull();
    // Top row sits higher (greater y) than the bottom row.
    expect(topLeft!.y).toBeGreaterThan(bottomLeft!.y);
    // Same row, so left sits at a smaller z than right.
    expect(topLeft!.z).toBeLessThan(topRight!.z);
  });

  it('is symmetric around the panel center', () => {
    const topLeft = soundboardSlotOffset(0);
    const bottomRight = soundboardSlotOffset(15);
    expect(topLeft).not.toBeNull();
    expect(bottomRight).not.toBeNull();
    expect(topLeft!.y).toBeCloseTo(-bottomRight!.y);
    expect(topLeft!.z).toBeCloseTo(-bottomRight!.z);
  });

  it('gives every slot in range a distinct offset', () => {
    const offsets = Array.from({ length: 16 }, (_, i) => soundboardSlotOffset(i));
    const keys = new Set(offsets.map((o) => `${o!.y.toFixed(3)}|${o!.z.toFixed(3)}`));
    expect(keys.size).toBe(16);
  });
});
