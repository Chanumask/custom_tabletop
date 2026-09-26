import * as THREE from 'three';

/**
 * Snow lying on everything outside (the winter theme, or a snowfall): every
 * plain lit material in the outside world whitens where it faces the sky —
 * the ground, roofs, the tops of fences and branches — by `amount` (0 none,
 * 1 a thick blanket). One shader addition instead of a second set of models.
 */
export function coverWithSnow(root: THREE.Object3D, amount: { value: number }): void {
  const patched = new Set<THREE.Material>();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshLambertMaterial && !patched.has(material)) {
        patched.add(material);
        addSnow(material, amount);
      }
    }
  });
}

function addSnow(material: THREE.MeshLambertMaterial, amount: { value: number }): void {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.uniforms.uSnow = amount;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSnowWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 snowWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          snowWorld = instanceMatrix * snowWorld;
        #endif
        vSnowWorld = (modelMatrix * snowWorld).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vSnowWorld;\nuniform float uSnow;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (uSnow > 0.001) {
          // The face's own normal, facing the viewer: up-facing faces seen from
          // above hold snow; the undersides of eaves don't.
          vec3 faceUp = normalize(cross(dFdx(vSnowWorld), dFdy(vSnowWorld)));
          float drift = fract(sin(dot(floor(vSnowWorld.xz * 3.0), vec2(12.9898, 78.233))) * 43758.5453);
          float lying = smoothstep(0.3 + 0.2 * drift, 0.75, faceUp.y) * uSnow;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 0.98), lying);
        }`,
      );
  };
  material.customProgramCacheKey = () => 'snow-cover';
  material.needsUpdate = true;
}
