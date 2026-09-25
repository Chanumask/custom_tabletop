import * as THREE from 'three';

/** The reading lamp beside the armchair (south-west corner) — it moved
 * here when the fireplace took the middle of the west wall. Its collider
 * (`COL_Lamp`) lives in the room model at the same spot. */
export const LAMP_POSITION = { x: -3.3, z: 3.55 };
export const LAMP_RANGE = 1.6;

const LAMP_ON_COLOR = 0xffe9b0;
const LAMP_OFF_EMISSIVE = 0x000000;
const LAMP_OFF_COLOR = 0x4a4030;

export interface RoomLamp {
  group: THREE.Group;
  bulb: THREE.Mesh;
  /** A small warm light the lamp actually casts on its corner of the room. */
  glow: THREE.PointLight;
}

const GLOW_INTENSITY = 4;

/**
 * A small standing lamp prop — the physical, walk-up-to-able object behind
 * the room's light interactable (Milestone 8). Its bulb's own material
 * toggles bright/dim in sync with `GameState.lightOn`
 * (`setLampOn`/`RoomLighting.ts`'s `setRoomLightsOn`), giving a clear visual
 * cue of the light's state beyond just the room's ambient brightness.
 */
export function createLamp(scene: THREE.Scene, floorY: number): RoomLamp {
  const group = new THREE.Group();
  group.name = 'lamp';

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.045, 1.1, 12),
    new THREE.MeshStandardMaterial({ color: 0x2b2018, roughness: 0.8 }),
  );
  pole.position.y = 0.55;
  group.add(pole);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.18, 0.05, 16),
    new THREE.MeshStandardMaterial({ color: 0x2b2018, roughness: 0.8 }),
  );
  base.position.y = 0.025;
  group.add(base);

  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 16, 16),
    new THREE.MeshStandardMaterial({
      color: LAMP_ON_COLOR,
      emissive: LAMP_ON_COLOR,
      emissiveIntensity: 1.2,
      roughness: 0.3,
    }),
  );
  bulb.name = 'bulb';
  bulb.position.y = 1.18;
  group.add(bulb);

  const glow = new THREE.PointLight(LAMP_ON_COLOR, GLOW_INTENSITY, 4, 2);
  glow.position.y = 1.18;
  group.add(glow);

  group.position.set(LAMP_POSITION.x, floorY, LAMP_POSITION.z);
  scene.add(group);

  return { group, bulb, glow };
}

export function setLampOn(lamp: RoomLamp, on: boolean): void {
  const material = lamp.bulb.material as THREE.MeshStandardMaterial;
  material.color.setHex(on ? LAMP_ON_COLOR : LAMP_OFF_COLOR);
  material.emissive.setHex(on ? LAMP_ON_COLOR : LAMP_OFF_EMISSIVE);
  material.emissiveIntensity = on ? 1.2 : 0;
  lamp.glow.intensity = on ? GLOW_INTENSITY : 0;
}

export function disposeLamp(lamp: RoomLamp): void {
  lamp.group.parent?.remove(lamp.group);
  for (const child of lamp.group.children) {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
  }
}
