import * as THREE from 'three';

/**
 * Recomputes a mesh's UVs from each vertex's local X/Z position instead of
 * trusting whatever UV layout Blender's default cylinder unwrap produced
 * (which splits top/side/bottom into separate islands, not a single 0..1
 * square) — see docs/decisions.md (Milestone 5). Only meant for the table
 * top: maps the inscribed circle of radius `radius` onto the full unit
 * square, so a canvas texture applied afterward displays edge-to-edge and
 * lines up exactly with `tableLocalToCanvas`'s input-side math.
 */
export function remapTableTopUV(mesh: THREE.Mesh, radius: number): void {
  const position = mesh.geometry.getAttribute('position');
  const uv = new Float32Array(position.count * 2);

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    uv[i * 2] = x / (2 * radius) + 0.5;
    uv[i * 2 + 1] = z / (2 * radius) + 0.5;
  }

  mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
