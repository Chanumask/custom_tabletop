import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const REQUIRED_ATTRIBUTES = ['position', 'normal', 'uv'];

/**
 * Fewer draw calls, the same look: merges the static meshes under `root`
 * that share a material into one mesh per material, each one's transform
 * (relative to `root`) baked into its geometry. Built from many small
 * shapes, the room's own furniture (the record cabinet, the lectern, the
 * window sashes, the winter decorations) would otherwise cost a draw call
 * per shape.
 *
 * Leaves alone: anything `skip` names (and everything under it) — whatever
 * moves or changes on its own — instanced meshes, points and sprites,
 * meshes with children or several materials, hidden meshes, mirrored ones,
 * and a material used only once. Returns the merged geometries, for the
 * caller to dispose.
 */
export function mergeStatic(
  root: THREE.Object3D,
  skip: (object: THREE.Object3D) => boolean = () => false,
): THREE.BufferGeometry[] {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const buckets = new Map<
    THREE.Material,
    { meshes: THREE.Mesh[]; parts: THREE.BufferGeometry[] }
  >();
  const visit = (node: THREE.Object3D) => {
    if (node !== root && skip(node)) return;
    for (const child of node.children) visit(child);
    if (!(node instanceof THREE.Mesh) || node instanceof THREE.InstancedMesh) return;
    if (node === root || node.children.length > 0 || !node.visible) return;
    if (Array.isArray(node.material) || node.matrixWorld.determinant() < 0) return;
    const source = node.geometry as THREE.BufferGeometry;
    if (!REQUIRED_ATTRIBUTES.every((name) => source.getAttribute(name))) return;
    const part = source.index ? source.toNonIndexed() : source.clone();
    // Vertex colors only where the material uses them (then every part of
    // it has them).
    const kept = (node.material as THREE.Material & { vertexColors?: boolean }).vertexColors
      ? [...REQUIRED_ATTRIBUTES, 'color']
      : REQUIRED_ATTRIBUTES;
    for (const name of Object.keys(part.attributes)) {
      if (!kept.includes(name)) part.deleteAttribute(name);
    }
    part.morphAttributes = {};
    part.clearGroups();
    part.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, node.matrixWorld));
    const bucket = buckets.get(node.material) ?? { meshes: [], parts: [] };
    bucket.meshes.push(node);
    bucket.parts.push(part);
    buckets.set(node.material, bucket);
  };
  visit(root);

  const merged: THREE.BufferGeometry[] = [];
  for (const [material, { meshes, parts }] of buckets) {
    const geometry = meshes.length > 1 ? mergeGeometries(parts) : null;
    parts.forEach((part) => part.dispose());
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${root.name || 'group'}-merged`;
    root.add(mesh);
    for (const original of meshes) original.removeFromParent();
    merged.push(geometry);
  }
  return merged;
}
