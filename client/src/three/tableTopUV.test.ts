import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { remapTableTopUV } from './tableTopUV.js';

function makeGeometryWithPositions(positions: [number, number, number][]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const flat = new Float32Array(positions.flat());
  geometry.setAttribute('position', new THREE.BufferAttribute(flat, 3));
  return geometry;
}

describe('remapTableTopUV', () => {
  it('maps the center vertex to uv (0.5, 0.5)', () => {
    const geometry = makeGeometryWithPositions([[0, 0.75, 0]]);
    const mesh = new THREE.Mesh(geometry);

    remapTableTopUV(mesh, 1.1);

    const uv = mesh.geometry.getAttribute('uv');
    expect(uv.getX(0)).toBeCloseTo(0.5);
    expect(uv.getY(0)).toBeCloseTo(0.5);
  });

  it('maps the circle edge onto the unit square boundary', () => {
    const radius = 1.1;
    const geometry = makeGeometryWithPositions([
      [radius, 0, 0], // +X edge
      [-radius, 0, 0], // -X edge
      [0, 0, radius], // +Z edge
      [0, 0, -radius], // -Z edge
    ]);
    const mesh = new THREE.Mesh(geometry);

    remapTableTopUV(mesh, radius);

    const uv = mesh.geometry.getAttribute('uv');
    expect(uv.getX(0)).toBeCloseTo(1);
    expect(uv.getX(1)).toBeCloseTo(0);
    expect(uv.getY(2)).toBeCloseTo(1);
    expect(uv.getY(3)).toBeCloseTo(0);
  });

  it('is independent of the y (height) coordinate', () => {
    const radius = 1.1;
    const geometry = makeGeometryWithPositions([
      [0.5, 0.71, 0.3],
      [0.5, 0.79, 0.3],
    ]);
    const mesh = new THREE.Mesh(geometry);

    remapTableTopUV(mesh, radius);

    const uv = mesh.geometry.getAttribute('uv');
    expect(uv.getX(0)).toBeCloseTo(uv.getX(1));
    expect(uv.getY(0)).toBeCloseTo(uv.getY(1));
  });
});
