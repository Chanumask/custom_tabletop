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

  add(new THREE.HemisphereLight(0xfff1dc, 0x5a4330, 0.75));

  const key = new THREE.PointLight(0xffc27a, 55, 12, 2);
  key.position.set(table.center.x, CHANDELIER_BULB_HEIGHT, table.center.z);
  add(key);

  const insetX = 1.6;
  const insetZ = 1.4;
  for (const x of [bounds.minX + insetX, bounds.maxX - insetX]) {
    for (const z of [bounds.minZ + insetZ, bounds.maxZ - insetZ]) {
      const fill = new THREE.PointLight(0xffe2bd, 9, 9, 2);
      fill.position.set(x, 2.4, z);
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

/** Filmic tone mapping keeps the photometric lights above from clipping to
 * flat white. (The table's map surface opts out of it — see RoomView.) */
export function configureRoomToneMapping(renderer: THREE.WebGLRenderer): void {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
}
