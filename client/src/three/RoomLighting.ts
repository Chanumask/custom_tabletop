import * as THREE from 'three';
import type { RoomLayout } from './RoomLayout.js';

/**
 * Scene-level lighting for the room view, independent of whichever room
 * asset is loaded (procedural or the real Blender `.glb`). Deliberately not
 * baked into the Blender export: Blender's Watt-based point lights convert
 * to glTF `KHR_lights_punctual` candela values (~600W -> ~30000cd) that
 * wildly overexpose Three's physically-correct renderer at room scale
 * (verified in-browser — the floor blew out to flat white). Tuned instead
 * directly in Three's photometric units against `renderer.toneMapping`.
 */
export function addRoomLighting(scene: THREE.Scene, layout: RoomLayout): void {
  const { table, wallHeight } = layout;

  const hemi = new THREE.HemisphereLight(0xfff3e0, 0x1a1410, 0.4);
  scene.add(hemi);

  const overTable = new THREE.PointLight(0xffc98a, 140, 14, 2);
  overTable.position.set(table.center.x, wallHeight - 0.15, table.center.z);
  scene.add(overTable);

  const fill = new THREE.PointLight(0xfff0da, 60, 18, 2);
  fill.position.set(table.center.x, wallHeight - 0.05, table.center.z);
  scene.add(fill);
}

/** Tone mapping tuned to keep the photometric point lights above from
 * clipping to flat white — see `addRoomLighting`. */
export function configureRoomToneMapping(renderer: THREE.WebGLRenderer): void {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
}
