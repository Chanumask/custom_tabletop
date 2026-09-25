import { describe, expect, it } from 'vitest';
import {
  canvasToTableLocal,
  gridLineOffsets,
  segmentPixelRect,
  tableLocalToCanvas,
} from './tableCoordinates.js';

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

describe('canvasToTableLocal', () => {
  it('undoes tableLocalToCanvas, on a non-square table too', () => {
    for (const [x, z] of [
      [0, 0],
      [0.7, -0.4],
      [-1.2, 0.9],
    ] as const) {
      const canvas = tableLocalToCanvas(x, z, 1.5, 1, 1024);
      const back = canvasToTableLocal(canvas, 1.5, 1, 1024);
      expect(back.x).toBeCloseTo(x, 9);
      expect(back.z).toBeCloseTo(z, 9);
    }
  });
});

describe('gridLineOffsets', () => {
  it('spaces cells + 1 lines evenly edge to edge, or none', () => {
    expect(gridLineOffsets(4, 1024)).toEqual([0, 256, 512, 768, 1024]);
    expect(gridLineOffsets(0, 1024)).toEqual([]);
  });
});

describe('segmentPixelRect', () => {
  it('covers a segment, its width and a little antialiasing, in pixels', () => {
    // Logical 100..200 x 50..60, width 4 (pad 4), at 2x.
    expect(segmentPixelRect({ x: 100, y: 50 }, { x: 200, y: 60 }, 4, 2, 2048)).toEqual({
      minX: 192,
      minY: 92,
      maxX: 408,
      maxY: 128,
    });
  });

  it('covers a dot, whichever way round the points come', () => {
    expect(segmentPixelRect({ x: 10, y: 10 }, { x: 10, y: 10 }, 6, 2, 2048)).toEqual({
      minX: 10,
      minY: 10,
      maxX: 30,
      maxY: 30,
    });
    expect(segmentPixelRect({ x: 200, y: 60 }, { x: 100, y: 50 }, 4, 2, 2048)).toEqual(
      segmentPixelRect({ x: 100, y: 50 }, { x: 200, y: 60 }, 4, 2, 2048),
    );
  });

  it('stays inside the canvas, and is null off it', () => {
    expect(segmentPixelRect({ x: -5, y: 1020 }, { x: 3, y: 1030 }, 4, 2, 2048)).toEqual({
      minX: 0,
      minY: 2032,
      maxX: 14,
      maxY: 2048,
    });
    expect(segmentPixelRect({ x: -50, y: -50 }, { x: -40, y: -40 }, 4, 2, 2048)).toBeNull();
  });
});
