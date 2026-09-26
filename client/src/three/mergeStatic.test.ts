import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { mergeStatic } from './mergeStatic.js';

function box(material: THREE.Material, x: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), material);
  mesh.position.x = x;
  return mesh;
}

describe('mergeStatic', () => {
  it('merges meshes sharing a material into one, where they were', () => {
    const wood = new THREE.MeshStandardMaterial();
    const brass = new THREE.MeshStandardMaterial();
    const root = new THREE.Group();
    root.position.set(5, 0, 0);
    const shelf = new THREE.Group();
    shelf.position.y = 1;
    root.add(box(wood, 0), box(wood, 1), shelf);
    shelf.add(box(wood, 2));
    root.add(box(brass, 3)); // alone: left as it is
    const merged = mergeStatic(root);
    expect(merged).toHaveLength(1);
    const meshes = root.children.filter((child) => child instanceof THREE.Mesh) as THREE.Mesh[];
    expect(meshes.map((mesh) => mesh.material)).toEqual([brass, wood]);
    // Every part is baked where it stood, relative to the group.
    merged[0]!.computeBoundingBox();
    const bounds = merged[0]!.boundingBox!;
    expect(bounds.min.x).toBeCloseTo(-0.05);
    expect(bounds.max.x).toBeCloseTo(2.05);
    expect(bounds.max.y).toBeCloseTo(1.05);
    expect(shelf.children).toHaveLength(0);
  });

  it('leaves alone what moves, what is hidden, and what has children', () => {
    const wood = new THREE.MeshStandardMaterial();
    const root = new THREE.Group();
    const moving = box(wood, 0);
    const hidden = box(wood, 1);
    hidden.visible = false;
    const parent = box(wood, 2);
    parent.add(box(new THREE.MeshStandardMaterial(), 0));
    root.add(moving, hidden, parent, box(wood, 3));
    expect(mergeStatic(root, (part) => part === moving)).toEqual([]);
    expect(root.children).toContain(moving);
    expect(root.children).toContain(hidden);
    expect(root.children).toContain(parent);
  });

  it('keeps vertex colors when the material uses them', () => {
    const painted = new THREE.MeshStandardMaterial({ vertexColors: true });
    const root = new THREE.Group();
    for (const [x, color] of [
      [0, 0xff0000],
      [1, 0x0000ff],
    ] as const) {
      const mesh = box(painted, x);
      const c = new THREE.Color(color);
      const colors = new Float32Array(mesh.geometry.attributes.position!.count * 3);
      for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
      mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      root.add(mesh);
    }
    const [merged] = mergeStatic(root);
    expect(merged!.getAttribute('color')).toBeDefined();
  });
});
