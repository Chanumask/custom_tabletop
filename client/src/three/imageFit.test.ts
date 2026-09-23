import { describe, expect, it } from 'vitest';
import { computeCoverRect } from './imageFit.js';

describe('computeCoverRect', () => {
  it('leaves a square image untouched, filling the target exactly', () => {
    expect(computeCoverRect(500, 500, 1024)).toEqual({ x: 0, y: 0, width: 1024, height: 1024 });
  });

  it('crops a wide image horizontally, centered, no vertical gap', () => {
    const rect = computeCoverRect(2000, 1000, 1024);
    expect(rect.height).toBe(1024);
    expect(rect.width).toBeCloseTo(2048); // scaled by 1024/1000
    expect(rect.y).toBe(0);
    expect(rect.x).toBeCloseTo((1024 - 2048) / 2); // centered, negative (cropped)
  });

  it('crops a tall image vertically, centered, no horizontal gap', () => {
    const rect = computeCoverRect(1000, 2000, 1024);
    expect(rect.width).toBe(1024);
    expect(rect.height).toBeCloseTo(2048);
    expect(rect.x).toBe(0);
    expect(rect.y).toBeCloseTo((1024 - 2048) / 2);
  });

  it('falls back to filling the target for a degenerate (zero-size) image', () => {
    expect(computeCoverRect(0, 0, 1024)).toEqual({ x: 0, y: 0, width: 1024, height: 1024 });
  });
});
