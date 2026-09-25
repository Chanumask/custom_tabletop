import { describe, expect, it } from 'vitest';
import {
  GRAVEYARD,
  LAKE,
  MOON_DIRECTION,
  VILLAGE,
  WINDMILL,
  YARD_RADIUS,
  groundHeight,
  lakeFactor,
  scatterTrees,
  treeAllowed,
} from './terrain.js';

describe('the land outside', () => {
  it('is flat around the house, with the floor level', () => {
    for (const [x, z] of [
      [0, 0],
      [6, 0],
      [-6, 3],
      [0, -10],
      [YARD_RADIUS * 0.9, 0],
    ]) {
      expect(groundHeight(x!, z!)).toBeCloseTo(0, 5);
    }
  });

  it('dips under the lake and rises to the village hill', () => {
    expect(lakeFactor(LAKE.x, LAKE.z)).toBe(1);
    expect(groundHeight(LAKE.x, LAKE.z)).toBeLessThan(LAKE.level);
    expect(groundHeight(VILLAGE.x, VILLAGE.z)).toBeGreaterThan(15);
  });

  it('keeps trees out of the yard, the lake, the village and the graveyard', () => {
    const trees = scatterTrees(400);
    expect(trees.length).toBe(400);
    for (const tree of trees) {
      expect(Math.hypot(tree.x, tree.z)).toBeGreaterThan(YARD_RADIUS);
      expect(lakeFactor(tree.x, tree.z)).toBe(0);
      expect(Math.hypot(tree.x - VILLAGE.x, tree.z - VILLAGE.z)).toBeGreaterThan(VILLAGE.radius);
      const inGraveyard =
        tree.x > GRAVEYARD.minX &&
        tree.x < GRAVEYARD.maxX &&
        tree.z > GRAVEYARD.minZ &&
        tree.z < GRAVEYARD.maxZ;
      expect(inGraveyard).toBe(false);
    }
    expect(treeAllowed(0, 0)).toBe(false);
    // The views out of the north and east windows stay open.
    expect(treeAllowed(-10, -60)).toBe(false);
    expect(treeAllowed(WINDMILL.x / 2, WINDMILL.z / 2)).toBe(false);
  });

  it('is the same forest for everyone', () => {
    expect(scatterTrees(50)).toEqual(scatterTrees(50));
  });

  it('hangs the moon low in the north-east', () => {
    expect(Math.hypot(MOON_DIRECTION.x, MOON_DIRECTION.y, MOON_DIRECTION.z)).toBeCloseTo(1);
    expect(MOON_DIRECTION.x).toBeGreaterThan(0); // east
    expect(MOON_DIRECTION.z).toBeLessThan(0); // north
    expect(MOON_DIRECTION.y).toBeGreaterThan(0.1);
    expect(MOON_DIRECTION.y).toBeLessThan(0.35);
  });
});
