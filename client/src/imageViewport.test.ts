import { describe, expect, it } from 'vitest';
import {
  centreOf,
  clampView,
  fitScale,
  fitView,
  panBy,
  scaleLimits,
  zoomAt,
} from './imageViewport.js';

// An A4 sheet scanned at 300 dpi in a laptop-sized viewer.
const sheet = { width: 2480, height: 3508 };
const frame = { width: 1200, height: 800 };

describe('the profile viewer’s zoom and pan', () => {
  it('fits the whole sheet, centred, with a margin', () => {
    const view = fitView(sheet, frame);
    expect(view.scale).toBeCloseTo((800 - 32) / 3508);
    expect(view.y).toBeCloseTo(16);
    expect(view.x).toBeCloseTo((1200 - 2480 * view.scale) / 2);
  });

  it('goes from the whole sheet to 4× its actual size', () => {
    expect(scaleLimits(sheet, frame)).toEqual({ min: fitScale(sheet, frame), max: 4 });
    // A small picture: out to its actual size, in past its fitted size.
    const small = { width: 200, height: 100 };
    const limits = scaleLimits(small, frame);
    expect(limits.min).toBe(1);
    expect(limits.max).toBeCloseTo(fitScale(small, frame) * 2);
  });

  it('zooms around the cursor, keeping what’s under it in place', () => {
    const view = fitView(sheet, frame);
    const cursor = { x: 700, y: 300 };
    const imagePoint = {
      x: (cursor.x - view.x) / view.scale,
      y: (cursor.y - view.y) / view.scale,
    };
    const zoomed = zoomAt(view, 1, cursor, sheet, frame);
    expect(zoomed.scale).toBe(1);
    expect(zoomed.x + imagePoint.x * zoomed.scale).toBeCloseTo(cursor.x);
    expect(zoomed.y + imagePoint.y * zoomed.scale).toBeCloseTo(cursor.y);
  });

  it('stops at the limits', () => {
    const view = fitView(sheet, frame);
    expect(zoomAt(view, 100, centreOf(frame), sheet, frame).scale).toBe(4);
    expect(zoomAt(view, 0.001, centreOf(frame), sheet, frame).scale).toBe(view.scale);
  });

  it('pans no further than the sheet’s edges', () => {
    const zoomed = zoomAt(fitView(sheet, frame), 1, { x: 0, y: 0 }, sheet, frame);
    expect(panBy(zoomed, 5000, 5000, sheet, frame)).toMatchObject({ x: 0, y: 0 });
    expect(panBy(zoomed, -1e6, -1e6, sheet, frame)).toMatchObject({
      x: 1200 - 2480,
      y: 800 - 3508,
    });
  });

  it('keeps a sheet narrower than the frame centred across', () => {
    const tall = clampView({ scale: 0.2, x: -300, y: 50 }, sheet, frame);
    expect(tall.x).toBeCloseTo((1200 - 2480 * 0.2) / 2);
  });
});
