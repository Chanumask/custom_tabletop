import { describe, expect, it } from 'vitest';
import { PINBOARD_SLOT_COUNT } from '@custom-tabletop/shared';
import { pinboardSlotRect, pinTilt, PINBOARD_COLS, PINBOARD_ROWS } from './pinboardLayout.js';

describe('pinboardSlotRect', () => {
  it('returns null for an out-of-range or non-integer index', () => {
    expect(pinboardSlotRect(-1, 480, 640)).toBeNull();
    expect(pinboardSlotRect(PINBOARD_SLOT_COUNT, 480, 640)).toBeNull();
    expect(pinboardSlotRect(1.5, 480, 640)).toBeNull();
  });

  it('places slot 0 at the top-left corner', () => {
    const rect = pinboardSlotRect(0, 480, 640);
    expect(rect).toEqual({ x: 0, y: 0, width: 160, height: 160 });
  });

  it('places the last slot at the bottom-right corner', () => {
    const rect = pinboardSlotRect(PINBOARD_SLOT_COUNT - 1, 480, 640);
    expect(rect).toEqual({
      x: (PINBOARD_COLS - 1) * 160,
      y: (PINBOARD_ROWS - 1) * 160,
      width: 160,
      height: 160,
    });
  });

  it('tiles the whole canvas with no gaps or overlaps', () => {
    const rects = Array.from({ length: PINBOARD_SLOT_COUNT }, (_, i) =>
      pinboardSlotRect(i, 480, 640),
    );
    const covered = rects.reduce((sum, r) => sum + r!.width * r!.height, 0);
    expect(covered).toBeCloseTo(480 * 640);
  });
});

describe('pinTilt', () => {
  it('is deterministic for the same id', () => {
    expect(pinTilt('abc')).toBe(pinTilt('abc'));
  });

  it('varies between different ids', () => {
    const tilts = new Set(['abc', 'def', 'ghi', 'jkl'].map(pinTilt));
    expect(tilts.size).toBeGreaterThan(1);
  });

  it('stays within a small tilt range', () => {
    for (const id of ['abc', 'def', 'ghi', 'a-long-uuid-like-string-here']) {
      expect(Math.abs(pinTilt(id))).toBeLessThanOrEqual(0.14);
    }
  });
});
