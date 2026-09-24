import * as THREE from 'three';
import type { TableSurface } from './RoomLayout.js';

/**
 * Recomputes the table top's UVs from each vertex's position relative to
 * the play surface (x/z), instead of trusting whatever UV layout came out of
 * Blender — see docs/decisions.md (Milestone 5). Maps the play surface's
 * full width/depth onto the unit square, so the canvas texture displays
 * edge-to-edge and lines up exactly with `tableLocalToCanvas`'s input-side
 * math. `table` is in world space; the mesh must be unrotated (the
 * exported table isn't), so world x/z offsets equal local ones.
 */
export function remapTableTopUV(mesh: THREE.Mesh, table: TableSurface): void {
  mesh.updateWorldMatrix(true, false);
  const position = mesh.geometry.getAttribute('position');
  const uv = new Float32Array(position.count * 2);
  const world = new THREE.Vector3();

  for (let i = 0; i < position.count; i += 1) {
    world.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    uv[i * 2] = (world.x - table.center.x) / (2 * table.halfWidth) + 0.5;
    uv[i * 2 + 1] = (world.z - table.center.z) / (2 * table.halfDepth) + 0.5;
  }

  mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
