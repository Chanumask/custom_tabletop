import { describe, expect, it } from 'vitest';
import { tableLocalToCanvas } from './tableCoordinates.js';

describe('tableLocalToCanvas', () => {
  it('maps the table center to the canvas center', () => {
    expect(tableLocalToCanvas(0, 0, 1.1, 1024)).toEqual({ x: 512, y: 512 });
  });

  it('maps the table edges to the canvas edges', () => {
    const radius = 1.1;
    const size = 1024;
    expect(tableLocalToCanvas(radius, 0, radius, size)).toEqual({ x: 1024, y: 512 });
    expect(tableLocalToCanvas(-radius, 0, radius, size)).toEqual({ x: 0, y: 512 });
    expect(tableLocalToCanvas(0, radius, radius, size)).toEqual({ x: 512, y: 1024 });
    expect(tableLocalToCanvas(0, -radius, radius, size)).toEqual({ x: 512, y: 0 });
  });

  it("agrees with remapTableTopUV's u/v formula (no inversion needed)", () => {
    // remapTableTopUV computes uv = (local / (2*radius)) + 0.5 — the exact
    // formula this function scales by canvasSize, so the two must produce
    // the same fraction for any given local coordinate.
    const radius = 1.1;
    const localX = 0.4;
    const localZ = -0.2;
    const expectedU = localX / (2 * radius) + 0.5;
    const expectedV = localZ / (2 * radius) + 0.5;

    const result = tableLocalToCanvas(localX, localZ, radius, 1000);
    expect(result.x / 1000).toBeCloseTo(expectedU);
    expect(result.y / 1000).toBeCloseTo(expectedV);
  });
});
