import * as THREE from 'three';

/** The reading lamp beside the armchair (south-west corner) — it moved
 * here when the fireplace took the middle of the west wall. Its collider
 * (`COL_Lamp`) lives in the room model at the same spot. */
export const LAMP_POSITION = { x: -3.3, z: 3.55 };
export const LAMP_RANGE = 1.6;

const LAMP_ON_COLOR = 0xffe9b0;
/** The shade's fabric: warm cream, glowing from inside when the lamp is on. */
const SHADE_COLOR = 0xe9d7b4;
const SHADE_GLOW = 0xffc47a;
const BULB_OFF_COLOR = 0x4a4030;

/** Where the light sits: inside the shade. */
const BULB_HEIGHT = 1.36;
const GLOW_INTENSITY = 4;

export interface RoomLamp {
  group: THREE.Group;
  bulb: THREE.Mesh;
  shade: THREE.Mesh;
  /** A small warm light the lamp actually casts on its corner of the room. */
  glow: THREE.PointLight;
}

/** A surface of revolution from [radius, height] pairs (bottom to top). */
function turned(profile: [number, number][], segments = 32): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

/** Pleated fabric, drawn once: soft vertical folds and a woven grain. */
function fabricTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 128);
    const pleats = 36;
    for (let i = 0; i < pleats; i += 1) {
      const x = (i / pleats) * 512;
      const fold = ctx.createLinearGradient(x, 0, x + 512 / pleats, 0);
      fold.addColorStop(0, 'rgba(90, 70, 40, 0.16)');
      fold.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
      fold.addColorStop(1, 'rgba(90, 70, 40, 0.1)');
      ctx.fillStyle = fold;
      ctx.fillRect(x, 0, 512 / pleats, 128);
    }
    for (let y = 0; y < 128; y += 2) {
      ctx.fillStyle = `rgba(120, 95, 60, ${0.03 + (y % 4 === 0 ? 0.03 : 0)})`;
      ctx.fillRect(0, y, 512, 1);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

/**
 * A Victorian standing lamp — the physical, walk-up-to-able object behind
 * the room's light interactable (Milestone 8): a weighted brass foot, a
 * turned brass column and a pleated fabric shade that glows from within
 * while the light is on (`setLampOn`, in sync with `GameState.lightOn` and
 * `RoomLighting.ts`'s `setRoomLightsOn`).
 */
export function createLamp(scene: THREE.Scene, floorY: number): RoomLamp {
  const group = new THREE.Group();
  group.name = 'lamp';

  // Brass without an environment to reflect reads as mud: only half metal.
  const brass = new THREE.MeshStandardMaterial({
    color: 0xb08842,
    metalness: 0.5,
    roughness: 0.36,
  });

  const foot = new THREE.Mesh(
    turned([
      [0.0, 0.0],
      [0.18, 0.0],
      [0.185, 0.012],
      [0.17, 0.028],
      [0.12, 0.05],
      [0.08, 0.09],
      [0.045, 0.12],
      [0.03, 0.14],
      [0.0, 0.14],
    ]),
    brass,
  );
  group.add(foot);

  // The column: slender, with turned collars and a bulb halfway up.
  const column = new THREE.Mesh(
    turned([
      [0.0, 0.13],
      [0.028, 0.13],
      [0.04, 0.16],
      [0.02, 0.19],
      [0.016, 0.6],
      [0.03, 0.66],
      [0.045, 0.72],
      [0.03, 0.78],
      [0.016, 0.84],
      [0.014, 1.2],
      [0.03, 1.23],
      [0.02, 1.26],
      [0.0, 1.26],
    ]),
    brass,
  );
  group.add(column);

  // Socket and bulb, inside the shade.
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.06, 16), brass);
  socket.position.y = 1.29;
  group.add(socket);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 20, 16),
    new THREE.MeshStandardMaterial({
      color: LAMP_ON_COLOR,
      emissive: LAMP_ON_COLOR,
      emissiveIntensity: 2,
      roughness: 0.3,
    }),
  );
  bulb.name = 'bulb';
  bulb.position.y = BULB_HEIGHT;
  group.add(bulb);

  // The shade: a tapered pleated drum on a brass harp, trimmed top and
  // bottom; double-sided so its lit inside shows from below.
  const fabric = fabricTexture();
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.23, 0.27, 48, 1, true),
    new THREE.MeshStandardMaterial({
      color: SHADE_COLOR,
      map: fabric,
      emissive: SHADE_GLOW,
      emissiveMap: fabric,
      emissiveIntensity: 0.9,
      roughness: 0.95,
      side: THREE.DoubleSide,
    }),
  );
  shade.name = 'shade';
  shade.position.y = 1.43;
  group.add(shade);
  for (const [radius, y] of [
    [0.13, 1.565],
    [0.23, 1.295],
  ] as const) {
    const trim = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.006, 8, 48), brass);
    trim.rotation.x = Math.PI / 2;
    trim.position.y = y;
    group.add(trim);
  }
  const harp = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.004, 6, 32, Math.PI), brass);
  harp.position.y = 1.29;
  group.add(harp);
  const finial = new THREE.Mesh(
    turned([
      [0.0, 1.565],
      [0.015, 1.565],
      [0.022, 1.585],
      [0.01, 1.61],
      [0.0, 1.62],
    ]),
    brass,
  );
  group.add(finial);

  const glow = new THREE.PointLight(LAMP_ON_COLOR, GLOW_INTENSITY, 4, 2);
  glow.position.y = BULB_HEIGHT - 0.04;
  group.add(glow);

  group.position.set(LAMP_POSITION.x, floorY, LAMP_POSITION.z);
  scene.add(group);

  return { group, bulb, shade, glow };
}

export function setLampOn(lamp: RoomLamp, on: boolean): void {
  const bulb = lamp.bulb.material as THREE.MeshStandardMaterial;
  bulb.color.setHex(on ? LAMP_ON_COLOR : BULB_OFF_COLOR);
  bulb.emissiveIntensity = on ? 2 : 0;
  const shade = lamp.shade.material as THREE.MeshStandardMaterial;
  shade.emissiveIntensity = on ? 0.9 : 0;
  lamp.glow.intensity = on ? GLOW_INTENSITY : 0;
}

export function disposeLamp(lamp: RoomLamp): void {
  lamp.group.parent?.remove(lamp.group);
  const materials = new Set<THREE.Material>();
  lamp.group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      materials.add(child.material as THREE.Material);
    }
  });
  for (const material of materials) {
    (material as THREE.MeshStandardMaterial).map?.dispose();
    material.dispose();
  }
}
