import { describe, expect, it } from 'vitest';
import type { ItemKind } from '@custom-tabletop/shared';
import { GadgetLibrary } from './gadgetMeshes.js';

const KINDS: ItemKind[] = ['camera', 'flashlight', 'walkie', 'calculator'];

describe('GadgetLibrary', () => {
  it('resolves a mesh for every gadget kind', async () => {
    const library = new GadgetLibrary();
    for (const kind of KINDS) {
      const mesh = await library.load(kind);
      expect(mesh).toBeDefined();
      expect(mesh.children.length).toBeGreaterThan(0);
    }
  });

  it('caches by kind — the same kind resolves to the same object', async () => {
    const library = new GadgetLibrary();
    const first = await library.load('camera');
    const second = await library.load('camera');
    expect(second).toBe(first);
  });
});
