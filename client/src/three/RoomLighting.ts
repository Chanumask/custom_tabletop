import * as THREE from 'three';
import type { RoomLayout } from './RoomLayout.js';

/** Never fully dark when the light is switched off — a faint ambient glow
 * so the room stays navigable rather than turning into a black void. */
const LIGHTS_OFF_SCALE = 0.08;

export interface RoomLights {
  hemi: THREE.HemisphereLight;
  overTable: THREE.PointLight;
  fill: THREE.PointLight;
  /** Each light's intensity when the room light is "on" — captured at
   * creation so `setRoomLightsOn` can scale relative to it without the two
   * functions needing to agree on the same magic numbers twice. */
  baseIntensity: { hemi: number; overTable: number; fill: number };
}

/**
 * Scene-level lighting for the room view, independent of whichever room
 * asset is loaded (procedural or the real Blender `.glb`). Deliberately not
 * baked into the Blender export: Blender's Watt-based point lights convert
 * to glTF `KHR_lights_punctual` candela values (~600W -> ~30000cd) that
 * wildly overexpose Three's physically-correct renderer at room scale
 * (verified in-browser — the floor blew out to flat white). Tuned instead
 * directly in Three's photometric units against `renderer.toneMapping`.
 */
export function addRoomLighting(scene: THREE.Scene, layout: RoomLayout): RoomLights {
  const { table, wallHeight } = layout;

  const hemi = new THREE.HemisphereLight(0xfff3e0, 0x1a1410, 0.4);
  scene.add(hemi);

  const overTable = new THREE.PointLight(0xffc98a, 140, 14, 2);
  overTable.position.set(table.center.x, wallHeight - 0.15, table.center.z);
  scene.add(overTable);

  const fill = new THREE.PointLight(0xfff0da, 60, 18, 2);
  fill.position.set(table.center.x, wallHeight - 0.05, table.center.z);
  scene.add(fill);

  return {
    hemi,
    overTable,
    fill,
    baseIntensity: { hemi: hemi.intensity, overTable: overTable.intensity, fill: fill.intensity },
  };
}

/** Toggles the room's lighting between its normal warm level and a dim
 * "switched off" level, driven by `GameState.lightOn` (Milestone 8's light
 * interactable) — never fully black (`LIGHTS_OFF_SCALE`), so the room stays
 * walkable/visible even with the light off. */
export function setRoomLightsOn(lights: RoomLights, on: boolean): void {
  const scale = on ? 1 : LIGHTS_OFF_SCALE;
  lights.hemi.intensity = lights.baseIntensity.hemi * scale;
  lights.overTable.intensity = lights.baseIntensity.overTable * scale;
  lights.fill.intensity = lights.baseIntensity.fill * scale;
}

/** Tone mapping tuned to keep the photometric point lights above from
 * clipping to flat white — see `addRoomLighting`. */
export function configureRoomToneMapping(renderer: THREE.WebGLRenderer): void {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
}
