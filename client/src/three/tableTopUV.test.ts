import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { remapTableTopUV } from './tableTopUV.js';

function makeMesh(positions: [number, number, number][]): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(positions.flat()), 3),
  );
  return new THREE.Mesh(geometry);
}

const table = { center: { x: 0, z: 0 }, halfWidth: 1, halfDepth: 1, height: 0.78 };

describe('remapTableTopUV', () => {
  it('maps the center to uv (0.5, 0.5) and the corners to the unit square corners', () => {
    const mesh = makeMesh([
      [0, 0.78, 0],
      [-1, 0.78, -1],
      [1, 0.78, 1],
    ]);
    remapTableTopUV(mesh, table);
    const uv = mesh.geometry.getAttribute('uv');
    expect([uv.getX(0), uv.getY(0)]).toEqual([0.5, 0.5]);
    expect([uv.getX(1), uv.getY(1)]).toEqual([0, 0]);
    expect([uv.getX(2), uv.getY(2)]).toEqual([1, 1]);
  });

  it('is independent of the y (height) coordinate', () => {
    const mesh = makeMesh([
      [0.5, 0.74, 0.3],
      [0.5, 0.78, 0.3],
    ]);
    remapTableTopUV(mesh, table);
    const uv = mesh.geometry.getAttribute('uv');
    expect(uv.getX(0)).toBeCloseTo(uv.getX(1));
    expect(uv.getY(0)).toBeCloseTo(uv.getY(1));
  });

  it('accounts for where the mesh sits in the world (an off-center table)', () => {
    const mesh = makeMesh([[0, 0, 0]]);
    mesh.position.set(2, 0, -3);
    remapTableTopUV(mesh, { ...table, center: { x: 2, z: -3 } });
    const uv = mesh.geometry.getAttribute('uv');
    expect([uv.getX(0), uv.getY(0)]).toEqual([0.5, 0.5]);
  });
});
