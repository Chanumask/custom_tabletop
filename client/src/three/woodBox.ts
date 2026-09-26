import * as THREE from 'three';

/** A box whose texture (wood grain) is the same size on every face — it
 * tiles once a metre — rather than stretched to fit each face. */
export function woodBox(w: number, h: number, d: number): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d);
  const uv = geometry.attributes.uv!;
  const normal = geometry.attributes.normal!;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const [su, sv] = nx > 0.5 ? [d, h] : ny > 0.5 ? [w, d] : [w, h];
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  return geometry;
}

/** The room's own dark wood (the skirting boards' material), to build new
 * furniture in — or null if the model hasn't got it. */
export function roomWood(root: THREE.Object3D): THREE.Material | null {
  let found: THREE.Material | null = null;
  root.traverse((node) => {
    if (!found && node instanceof THREE.Mesh && !Array.isArray(node.material)) {
      if (node.material.name === 'dark_wood') found = node.material;
    }
  });
  return found;
}
