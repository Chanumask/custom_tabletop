import { describe, expect, it } from 'vitest';
import { tableLocalToCanvas } from './tableCoordinates.js';

describe('tableLocalToCanvas', () => {
  it('maps the table center to the canvas center', () => {
    expect(tableLocalToCanvas(0, 0, 1, 1, 1024)).toEqual({ x: 512, y: 512 });
  });

  it('maps the play surface edges (and so its corners) to the canvas edges', () => {
    expect(tableLocalToCanvas(1, 0, 1, 1, 1024)).toEqual({ x: 1024, y: 512 });
    expect(tableLocalToCanvas(-1, 0, 1, 1, 1024)).toEqual({ x: 0, y: 512 });
    expect(tableLocalToCanvas(0, 1, 1, 1, 1024)).toEqual({ x: 512, y: 1024 });
    expect(tableLocalToCanvas(0, -1, 1, 1, 1024)).toEqual({ x: 512, y: 0 });
    // A square table's corner is a real, drawable spot — unlike the old
    // round table, nothing of the canvas is hidden past its edge.
    expect(tableLocalToCanvas(-1, -1, 1, 1, 1024)).toEqual({ x: 0, y: 0 });
  });

  it('stretches each axis over its own extent for a rectangular table', () => {
    expect(tableLocalToCanvas(1.5, 1, 1.5, 1, 1000)).toEqual({ x: 1000, y: 1000 });
  });

  it("agrees with remapTableTopUV's u/v formula (no inversion needed)", () => {
    const localX = 0.4;
    const localZ = -0.2;
    const result = tableLocalToCanvas(localX, localZ, 1, 1, 1000);
    expect(result.x / 1000).toBeCloseTo(localX / 2 + 0.5);
    expect(result.y / 1000).toBeCloseTo(localZ / 2 + 0.5);
  });
});
