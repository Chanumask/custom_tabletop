import * as THREE from 'three';
import { seededRandom } from '../parchment.js';
import { groundHeight } from './terrain.js';
import { glowPointsMaterial, type Kit, type Piece } from './kit.js';

/** Whether a point is inside the house (nothing outside may drift in). */
function inHouse(x: number, z: number): boolean {
  return Math.abs(x) < 5.6 && Math.abs(z) < 4.6;
}

/** Fireflies over the yard and meadow — yellow-green, or on Halloween,
 * violet will-o'-the-wisps. Each glows up now and then, then fades. */
export function buildFireflies(kit: Kit): Piece {
  const count = 110;
  const random = seededRandom(0xf1e5);
  const base = new Float32Array(count * 3);
  const positions = new Float32Array(count * 3);
  const alphas = new Float32Array(count);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    let x = 0;
    let z = 0;
    do {
      const angle = random() * Math.PI * 2;
      const r = 9 + random() ** 1.3 * 36;
      x = Math.cos(angle) * r;
      z = Math.sin(angle) * r;
    } while (inHouse(x, z));
    base[i * 3] = x;
    base[i * 3 + 1] = groundHeight(x, z) + 0.3 + random() * 2.4;
    base[i * 3 + 2] = z;
    phases[i] = random() * 100;
    speeds[i] = 0.6 + random() * 0.9;
  }
  positions.set(base);
  const geometry = kit.keep(new THREE.BufferGeometry());
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
  const material = kit.keep(
    glowPointsMaterial(kit.glow(), new THREE.Color(2.2, 2.6, 0.9), 0.14, kit.pointScale),
  );
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return {
    object: points,
    setTheme(theme) {
      material.uniforms.color!.value =
        theme === 'halloween' ? new THREE.Color(1.5, 0.9, 2.6) : new THREE.Color(2.2, 2.6, 0.9);
    },
    update(_dt, time) {
      for (let i = 0; i < count; i += 1) {
        const t = time * speeds[i]! * 0.35 + phases[i]!;
        const still = kit.reducedMotion ? 0 : 1;
        positions[i * 3] = base[i * 3]! + still * (Math.sin(t) * 1.4 + Math.sin(t * 2.3) * 0.3);
        positions[i * 3 + 1] = base[i * 3 + 1]! + still * Math.sin(t * 1.7) * 0.4;
        positions[i * 3 + 2] = base[i * 3 + 2]! + still * (Math.cos(t * 0.8) * 1.4);
        // A slow pulse: mostly dark, glowing for a moment each cycle.
        const pulse = Math.sin(time * speeds[i]! + phases[i]!);
        alphas[i] = kit.reducedMotion ? 0.6 : Math.max(0, pulse) ** 3;
      }
      geometry.attributes.position!.needsUpdate = true;
      geometry.attributes.alpha!.needsUpdate = true;
    },
  };
}

/** Autumn leaves drifting down past the windows. */
export function buildFallingLeaves(kit: Kit): Piece {
  const count = 60;
  const random = seededRandom(0x1ea5);
  const geometry = kit.keep(new THREE.PlaneGeometry(0.13, 0.1));
  const material = kit.keep(
    new THREE.MeshLambertMaterial({
      side: THREE.DoubleSide,
      emissive: new THREE.Color('#3a1a08'),
    }),
  );
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  const palette = ['#c2561a', '#a8321c', '#d98c24', '#8a4a1c', '#b8741e'].map(
    (color) => new THREE.Color(color),
  );
  const leaves = Array.from({ length: count }, (_, index) => {
    mesh.setColorAt(index, palette[index % palette.length]!);
    return spawn(
      {
        x: 0,
        y: 0,
        z: 0,
        fall: 0,
        spin: new THREE.Vector3(),
        phase: 0,
        rotation: new THREE.Euler(),
      },
      true,
    );
  });

  function spawn<
    T extends {
      x: number;
      y: number;
      z: number;
      fall: number;
      spin: THREE.Vector3;
      phase: number;
      rotation: THREE.Euler;
    },
  >(leaf: T, anywhere: boolean): T {
    // Somewhere around the house, within sight of a window.
    let x = 0;
    let z = 0;
    do {
      x = (random() - 0.5) * 34;
      z = (random() - 0.5) * 30;
    } while (inHouse(x, z) || Math.hypot(x, z) < 6.5);
    leaf.x = x;
    leaf.z = z;
    leaf.y = anywhere ? random() * 7 : 6 + random() * 2;
    leaf.fall = 0.35 + random() * 0.45;
    leaf.spin.set(random() * 3, random() * 3, random() * 3);
    leaf.phase = random() * 10;
    leaf.rotation.set(random() * 6, random() * 6, random() * 6);
    return leaf;
  }

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const position = new THREE.Vector3();
  return {
    object: mesh,
    update(dt, time) {
      leaves.forEach((leaf, index) => {
        if (!kit.reducedMotion) {
          leaf.y -= leaf.fall * dt;
          // A breeze from the west, gusting.
          leaf.x +=
            (0.35 + 0.3 * Math.sin(time * 0.4)) * dt + Math.sin(time * 1.3 + leaf.phase) * 0.4 * dt;
          leaf.z += Math.cos(time * 1.1 + leaf.phase) * 0.35 * dt;
          leaf.rotation.x += leaf.spin.x * dt;
          leaf.rotation.y += leaf.spin.y * dt;
          leaf.rotation.z += leaf.spin.z * dt;
          if (leaf.y < groundHeight(leaf.x, leaf.z) + 0.02 || inHouse(leaf.x, leaf.z))
            spawn(leaf, false);
        }
        position.set(leaf.x, leaf.y, leaf.z);
        matrix.compose(position, quaternion.setFromEuler(leaf.rotation), scale);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
