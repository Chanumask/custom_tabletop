import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ItemKind } from '@custom-tabletop/shared';
import { GadgetLibrary, gadgetUrl } from './gadgetMeshes.js';

const KINDS: ItemKind[] = ['camera', 'flashlight', 'walkie', 'calculator'];

/** The built model, read straight from client/public (blender/gadgets.py). */
async function model(kind: ItemKind): Promise<THREE.Object3D> {
  const file = readFileSync(new URL(`../../public${gadgetUrl(kind)}`, import.meta.url));
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const gltf = await new GLTFLoader().parseAsync(buffer as ArrayBuffer, '');
  return gltf.scene;
}

function materialNames(object: THREE.Object3D): string[] {
  const names: string[] = [];
  object.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      names.push(...materials.map((material: THREE.Material) => material.name));
    }
  });
  return names;
}

describe('GadgetLibrary', () => {
  it('loads each kind once and shares it, retrying one that failed', async () => {
    const library = new GadgetLibrary();
    const loader = (library as unknown as { loader: { loadAsync: unknown } }).loader;
    const scene = new THREE.Group();
    const loadAsync = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ scene });
    loader.loadAsync = loadAsync;

    await expect(library.load('camera')).rejects.toThrow('offline');
    expect(await library.load('camera')).toBe(scene);
    expect(await library.load('camera')).toBe(scene);
    expect(loadAsync).toHaveBeenCalledTimes(2);
    expect(loadAsync).toHaveBeenLastCalledWith('/models/gadgets/camera.glb');
  });
});

describe('the gadget models', () => {
  it('are real-world sized, from a few centimetres to a hand-filling camera', async () => {
    for (const kind of KINDS) {
      const size = new THREE.Box3().setFromObject(await model(kind)).getSize(new THREE.Vector3());
      expect(Math.max(size.x, size.y, size.z)).toBeGreaterThan(0.1);
      expect(Math.max(size.x, size.y, size.z)).toBeLessThan(0.25);
    }
  });

  it('carry the materials the avatars light up', async () => {
    expect(materialNames(await model('flashlight'))).toContain('FlashlightLens');
    expect(materialNames(await model('camera'))).toContain('CameraFlash');
  });

  it("put the flashlight's lens at its front (+Z), where the beam starts", async () => {
    const flashlight = await model('flashlight');
    const lens = flashlight.getObjectByName('Lens');
    expect(lens).toBeDefined();
    const box = new THREE.Box3().setFromObject(flashlight);
    expect(lens!.position.z).toBeCloseTo(box.max.z, 2);
    expect(Math.abs(lens!.position.x)).toBeLessThan(1e-6);
    expect(Math.abs(lens!.position.y)).toBeLessThan(1e-6);
  });

  it('keep the camera lens and the walkie screen on the front (+Z)', async () => {
    for (const [kind, front] of [
      ['camera', 'CameraGlass'],
      ['walkie', 'WalkieScreen'],
      ['calculator', 'CalculatorScreen'],
    ] as const) {
      const scene = await model(kind);
      scene.updateMatrixWorld(true);
      let centre: THREE.Vector3 | null = null;
      scene.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          const materials = node.material as THREE.Material[] | THREE.Material;
          const list = Array.isArray(materials) ? materials : [materials];
          const index = list.findIndex((material) => material.name === front);
          const group = node.geometry.groups.find(
            (g: { materialIndex?: number }) => g.materialIndex === index,
          );
          if (index >= 0) {
            const position = node.geometry.getAttribute('position');
            const box = new THREE.Box3();
            const start = group?.start ?? 0;
            const count = group?.count ?? position.count;
            const indexAttr = node.geometry.getIndex();
            for (let i = start; i < start + count; i += 1) {
              const v = indexAttr ? indexAttr.getX(i) : i;
              box.expandByPoint(new THREE.Vector3().fromBufferAttribute(position, v));
            }
            centre = box.getCenter(new THREE.Vector3());
          }
        }
      });
      expect(centre, `${kind} has its ${front}`).not.toBeNull();
      expect(centre!.z, `${kind}'s ${front} faces +Z`).toBeGreaterThan(0);
    }
  });
});
