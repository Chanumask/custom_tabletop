import * as THREE from 'three';
import type { ItemKind } from '@custom-tabletop/shared';

/** Loads the held-item mesh for a gadget kind — an interface so avatar code
 * can be tested with synthetic models, the same reasoning as
 * `characters.ts`'s `CharacterSource`. */
export interface GadgetSource {
  load(kind: ItemKind): Promise<THREE.Object3D>;
}

/**
 * TODO(gadgets meshes): these are placeholder procedural shapes, not the
 * real Blender-modeled props — swap `GadgetLibrary.load` below for a
 * `GLTFLoader.loadAsync('/models/gadgets/<kind>.glb')` once those are
 * exported (docs/decisions.md, "Held-item meshes"), the same way
 * `CharacterLibrary` loads `/models/characters/<color>.glb`. Nothing else
 * needs to change — `PlayerAvatars.ts` only depends on this module
 * resolving to *some* `Object3D` per kind.
 */
function placeholderMesh(kind: ItemKind): THREE.Object3D {
  const group = new THREE.Group();
  group.name = `gadget-${kind}-placeholder`;
  switch (kind) {
    case 'camera': {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.07, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x2b2620, roughness: 0.6 }),
      );
      group.add(body);
      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.022, 0.035, 16),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.4 }),
      );
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, 0.005, 0.04);
      group.add(lens);
      break;
    }
    case 'flashlight': {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.14, 16),
        new THREE.MeshStandardMaterial({ color: 0x30302f, roughness: 0.4, metalness: 0.5 }),
      );
      barrel.rotation.z = Math.PI / 2;
      group.add(barrel);
      const head = new THREE.Mesh(
        new THREE.CylinderGeometry(0.024, 0.018, 0.03, 16),
        new THREE.MeshStandardMaterial({ color: 0xc9c9c9, roughness: 0.25, metalness: 0.7 }),
      );
      head.rotation.z = Math.PI / 2;
      head.position.x = -0.085;
      group.add(head);
      break;
    }
    case 'walkie': {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, 0.13, 0.03),
        new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.55 }),
      );
      group.add(body);
      const antenna = new THREE.Mesh(
        new THREE.CylinderGeometry(0.003, 0.003, 0.09, 8),
        new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.4, metalness: 0.6 }),
      );
      antenna.position.set(0.015, 0.11, 0);
      group.add(antenna);
      break;
    }
    case 'calculator': {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.12, 0.012),
        new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.6 }),
      );
      group.add(body);
      const screen = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.025, 0.002),
        new THREE.MeshStandardMaterial({ color: 0x1c2a1c, roughness: 0.3 }),
      );
      screen.position.set(0, 0.04, 0.008);
      group.add(screen);
      break;
    }
  }
  return group;
}

/** Loads each kind's mesh at most once; every avatar clones from it —
 * exactly `CharacterLibrary`'s pattern. */
export class GadgetLibrary implements GadgetSource {
  private readonly cache = new Map<ItemKind, Promise<THREE.Object3D>>();

  load(kind: ItemKind): Promise<THREE.Object3D> {
    let pending = this.cache.get(kind);
    if (!pending) {
      pending = Promise.resolve(placeholderMesh(kind));
      this.cache.set(kind, pending);
    }
    return pending;
  }
}
