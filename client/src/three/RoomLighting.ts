import * as THREE from 'three';
import type { RoomLayout } from './RoomLayout.js';

/** Never fully dark when the light is switched off — a faint ambient glow
 * so the room stays navigable rather than turning into a black void. */
const LIGHTS_OFF_SCALE = 0.08;

/** Where the chandelier's lantern hangs (its bulb), in metres above the
 * floor — the main light sits there so it visibly comes *from* the fixture
 * (blender/room.blend's `Chandelier`, hung from the middle ceiling beam). */
const CHANDELIER_BULB_HEIGHT = 2.35;

export interface RoomLights {
  /** Every room light with the intensity it has when the room light is "on"
   * — `setRoomLightsOn` scales relative to these, so the two functions never
   * have to agree on magic numbers twice. */
  entries: { light: THREE.Light; baseIntensity: number }[];
}

/**
 * Scene-level lighting for the room, added in Three's own photometric units
 * rather than exported from Blender: Blender's Watt-based lights convert to
 * glTF candela values that wildly overexpose Three's physically-correct
 * renderer at room scale (docs/decisions.md, Milestone 3). Layout:
 *
 * - a warm key light inside the chandelier over the table,
 * - four soft fills near the corners, so walls and furniture aren't lit
 *   only from the middle of the room (and the ceiling right above the key
 *   light doesn't blow out),
 * - a hemisphere light whose "ground" color is a warm bounce, so surfaces
 *   facing down (beam undersides, the ceiling) aren't pitch black.
 */
export function addRoomLighting(scene: THREE.Scene, layout: RoomLayout): RoomLights {
  const { table, bounds } = layout;
  const entries: RoomLights['entries'] = [];
  const add = (light: THREE.Light) => {
    scene.add(light);
    entries.push({ light, baseIntensity: light.intensity });
  };

  // Kept low on purpose: the room should pool light around its sources
  // (chandelier, fire, candles, lamps — Ambience.ts), not glow evenly.
  add(new THREE.HemisphereLight(0xffe6c8, 0x4a3322, 0.42));

  // The chandelier: a spot pooling warm light on the table (a point light
  // this close under the plank ceiling burned a hotspot into it), plus a
  // softer point light for the rest of the room.
  const key = new THREE.SpotLight(0xffbb70, 70, 10, 1.05, 0.75, 2);
  key.position.set(table.center.x, CHANDELIER_BULB_HEIGHT, table.center.z);
  key.target.position.set(table.center.x, 0, table.center.z);
  scene.add(key.target);
  add(key);
  // Hung well below the lantern: a few centimetres under it, inverse-square
  // falloff blew its bottom ironwork out to flat white patches.
  const bounce = new THREE.PointLight(0xffc488, 16, 11, 2);
  bounce.position.set(table.center.x, CHANDELIER_BULB_HEIGHT - 0.6, table.center.z);
  add(bounce);

  const insetX = 1.6;
  const insetZ = 1.4;
  for (const x of [bounds.minX + insetX, bounds.maxX - insetX]) {
    for (const z of [bounds.minZ + insetZ, bounds.maxZ - insetZ]) {
      const fill = new THREE.PointLight(0xffd6a8, 5, 8, 2);
      // Well below the plank ceiling, so it doesn't burn a bright patch into it.
      fill.position.set(x, 1.95, z);
      add(fill);
    }
  }

  return { entries };
}

/** Toggles the room's lighting between its normal warm level and a dim
 * "switched off" level, driven by `GameState.lightOn` (Milestone 8's light
 * interactable) — never fully black (`LIGHTS_OFF_SCALE`), so the room stays
 * walkable/visible even with the light off. */
export function setRoomLightsOn(lights: RoomLights, on: boolean): void {
  const scale = on ? 1 : LIGHTS_OFF_SCALE;
  for (const { light, baseIntensity } of lights.entries) {
    light.intensity = baseIntensity * scale;
  }
}

/** Lightning through the windows (a storm): the room's soft ambient light
 * flares cold and bright for a moment — no extra light (adding one would
 * recompile every material). `amount` 0..1; 0 puts it back. */
export function setLightningFlash(lights: RoomLights, amount: number, lightOn: boolean): void {
  for (const entry of lights.entries) {
    if (!(entry.light instanceof THREE.HemisphereLight)) continue;
    const base = entry.baseIntensity * (lightOn ? 1 : LIGHTS_OFF_SCALE);
    entry.light.intensity = base + amount * 2.2;
    let color = baseColors.get(entry.light);
    if (!color) {
      color = entry.light.color.clone();
      baseColors.set(entry.light, color);
    }
    entry.light.color.copy(color).lerp(FLASH_COLOR, Math.min(1, amount * 1.5));
  }
}

const FLASH_COLOR = new THREE.Color(0.75, 0.85, 1);
/** Each ambient light's own colour, to go back to after a flash. */
const baseColors = new WeakMap<THREE.Light, THREE.Color>();

/** Filmic tone mapping keeps the photometric lights above from clipping to
 * flat white. (The table's map surface opts out of it — see RoomView.) */
export function configureRoomToneMapping(renderer: THREE.WebGLRenderer): void {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
}

/** Material touch-ups the glTF can't carry: the parquet's roughness map is
 * too glossy under point lights (sharp plastic highlights). */
export function tuneRoomMaterials(root: THREE.Object3D): void {
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial && /parquet/i.test(material.name)) {
        material.roughness = 1.45;
      }
    }
  });
}
