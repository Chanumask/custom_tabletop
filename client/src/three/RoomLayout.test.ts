import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_ROOM_LAYOUT, seatedCameraHeight } from './RoomLayout.js';
import { isClear } from './collision.js';

describe('seatedCameraHeight', () => {
  it('frames the whole play surface (plus a margin) in the view cone', () => {
    const table = { center: { x: 0, z: 0 }, halfWidth: 1, halfDepth: 1, height: 0.78 };
    const y = seatedCameraHeight(table, 70);
    const visibleHalf = (y - table.height) * Math.tan((35 * Math.PI) / 180);
    expect(visibleHalf).toBeGreaterThan(1.0);
    expect(visibleHalf).toBeLessThan(1.25);
  });

  it('uses the longer side of a rectangular table', () => {
    const wide = { center: { x: 0, z: 0 }, halfWidth: 1.5, halfDepth: 1, height: 0.8 };
    const square = { ...wide, halfWidth: 1 };
    expect(seatedCameraHeight(wide, 70)).toBeGreaterThan(seatedCameraHeight(square, 70));
  });
});

describe('PLACEHOLDER_ROOM_LAYOUT', () => {
  it('keeps the default spawn point clear of the furniture', () => {
    expect(isClear({ x: 0, z: 3 }, PLACEHOLDER_ROOM_LAYOUT.obstacles, 0.3)).toBe(true);
  });
});
