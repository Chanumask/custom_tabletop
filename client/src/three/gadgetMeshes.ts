import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { isDrink, type ItemKind } from '@custom-tabletop/shared';
import type { HeldKind } from './heldItems.js';
import { buildMug } from './refreshmentMeshes.js';

/** Loads the held-item mesh for a gadget kind — an interface so avatar code
 * can be tested with synthetic models, the same reasoning as
 * `characters.ts`'s `CharacterSource`. */
export interface GadgetSource {
  load(kind: HeldKind): Promise<THREE.Object3D>;
}

/** Built by blender/gadgets.py — one small model per gadget kind. */
export function gadgetUrl(kind: ItemKind): string {
  return `/models/gadgets/${kind}.glb`;
}

const KINDS: ItemKind[] = ['camera', 'flashlight', 'walkie', 'calculator'];

/** Loads each kind's model at most once; every avatar clones from it —
 * exactly `CharacterLibrary`'s pattern. */
export class GadgetLibrary implements GadgetSource {
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<HeldKind, Promise<THREE.Object3D>>();

  load(kind: HeldKind): Promise<THREE.Object3D> {
    let pending = this.cache.get(kind);
    if (!pending) {
      // A drink's mug is a few shapes, made here (refreshmentMeshes.ts).
      pending = isDrink(kind)
        ? Promise.resolve(buildMug(kind))
        : this.loader.loadAsync(gadgetUrl(kind)).then((gltf) => gltf.scene);
      pending.catch(() => this.cache.delete(kind)); // allow a retry after a failed load
      this.cache.set(kind, pending);
    }
    return pending;
  }

  /** Fetches all four up front (about 400 KB together), so a gadget is
   * already in hand the moment someone takes it from the chest. */
  preload(): void {
    for (const kind of KINDS) {
      this.load(kind).catch(() => {
        // Retried on first use; the failure is logged there.
      });
    }
  }
}
