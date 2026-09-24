import { describe, expect, it } from 'vitest';
import {
  clampTransform,
  fillTransform,
  fitTransform,
  rescaleTransform,
  scaleLimits,
  zoomAt,
} from './mapFit.js';

describe('fitTransform / fillTransform', () => {
  it('fit shows a wide image whole, letterboxed top and bottom', () => {
    const t = fitTransform(2000, 1000, 400);
    expect(t.scale).toBeCloseTo(0.2);
    expect(t.x).toBeCloseTo(0);
    expect(t.y).toBeCloseTo(100); // (400 - 200) / 2
  });

  it('fill covers the frame with a wide image, cropping its sides', () => {
    const t = fillTransform(2000, 1000, 400);
    expect(t.scale).toBeCloseTo(0.4);
    expect(t.x).toBeCloseTo(-200); // (400 - 800) / 2
    expect(t.y).toBeCloseTo(0);
  });

  it('fit and fill agree for a square image', () => {
    expect(fitTransform(500, 500, 400)).toEqual(fillTransform(500, 500, 400));
  });
});

describe('scaleLimits', () => {
  it('spans from well below fit to well beyond fill', () => {
    const { min, max } = scaleLimits(2000, 1000, 400);
    expect(min).toBeLessThan(fitTransform(2000, 1000, 400).scale);
    expect(max).toBeGreaterThan(fillTransform(2000, 1000, 400).scale);
  });
});

describe('zoomAt', () => {
  it('keeps the anchor point over the same spot of the image', () => {
    const start = { scale: 1, x: 10, y: 20 };
    const anchor = { x: 200, y: 200 };
    const imagePointBefore = {
      x: (anchor.x - start.x) / start.scale,
      y: (anchor.y - start.y) / start.scale,
    };
    const zoomed = zoomAt(start, 2.5, anchor);
    const imagePointAfter = {
      x: (anchor.x - zoomed.x) / zoomed.scale,
      y: (anchor.y - zoomed.y) / zoomed.scale,
    };
    expect(imagePointAfter.x).toBeCloseTo(imagePointBefore.x);
    expect(imagePointAfter.y).toBeCloseTo(imagePointBefore.y);
    expect(zoomed.scale).toBe(2.5);
  });
});

describe('clampTransform', () => {
  it('leaves a transform that is comfortably in frame alone', () => {
    const t = fitTransform(800, 600, 400);
    expect(clampTransform(t, 800, 600, 400)).toEqual(t);
  });

  it('never lets the image be dragged completely off the table', () => {
    const lost = clampTransform({ scale: 0.5, x: 5000, y: -5000 }, 800, 600, 400);
    const w = 800 * 0.5;
    const h = 600 * 0.5;
    // some of the image still overlaps the 0..400 frame on both axes
    expect(lost.x).toBeLessThan(400);
    expect(lost.x + w).toBeGreaterThan(0);
    expect(lost.y).toBeLessThan(400);
    expect(lost.y + h).toBeGreaterThan(0);
  });
});

describe('rescaleTransform', () => {
  it('reproduces the same framing in a larger output frame', () => {
    const preview = { scale: 0.3, x: -12, y: 40 };
    const output = rescaleTransform(preview, 400, 2048);
    const k = 2048 / 400;
    expect(output).toEqual({ scale: 0.3 * k, x: -12 * k, y: 40 * k });
  });
});
