import * as THREE from 'three';
import type { Drink } from '@custom-tabletop/shared';

/**
 * The mug a player holds (tea or cocoa) and the popcorn bowl on the table
 * (docs/decisions.md, "The cozy room, lived in"), built from a few shapes — small
 * enough not to need a model file. The mug's origin is where the hand
 * grips its handle; its body sits toward -X, and it's upright along +Y.
 */

const MUG = { radius: 0.041, height: 0.09, wall: 0.004 };
/** From the handle's grip to the mug's middle. */
const GRIP_TO_BODY = MUG.radius + 0.024;

const MUG_COLORS: Record<Drink, number> = { tea: 0xe9dfcf, cocoa: 0x9b2f24 };
const DRINK_COLORS: Record<Drink, number> = { tea: 0x7a3c10, cocoa: 0x4a2414 };

let puff: THREE.Texture | null = null;
/** A soft round wisp for the steam: white, fading out from the middle. */
function steamTexture(): THREE.Texture {
  if (puff) return puff;
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const alpha = Math.max(0, 1 - r) ** 1.6;
      const i = (y * size + x) * 4;
      data.set([255, 255, 255, Math.round(alpha * 230)], i);
    }
  }
  puff = new THREE.DataTexture(data, size, size);
  puff.magFilter = THREE.LinearFilter;
  puff.minFilter = THREE.LinearFilter;
  puff.needsUpdate = true;
  return puff;
}

/** A mug of `drink`: glazed ceramic, the drink inside, a wisp of steam
 * (sprites named "Steam", which the avatar code lifts and fades). */
export function buildMug(drink: Drink): THREE.Group {
  const mug = new THREE.Group();
  mug.name = `Mug-${drink}`;
  const body = new THREE.Group();
  body.position.x = -GRIP_TO_BODY;
  mug.add(body);

  const { radius, height, wall } = MUG;
  // The cup's profile, turned: inside down, over the rim, down the outside.
  const profile = [
    new THREE.Vector2(0.0001, wall),
    new THREE.Vector2(radius - wall, wall),
    new THREE.Vector2(radius - wall, height - 0.002),
    new THREE.Vector2(radius - wall / 2, height),
    new THREE.Vector2(radius, height - 0.002),
    new THREE.Vector2(radius, 0.006),
    new THREE.Vector2(radius - 0.004, 0),
    new THREE.Vector2(0.0001, 0),
  ];
  const ceramic = new THREE.MeshStandardMaterial({
    name: 'MugCeramic',
    color: MUG_COLORS[drink],
    roughness: 0.35,
    metalness: 0,
  });
  const cup = new THREE.Mesh(new THREE.LatheGeometry(profile, 28), ceramic);
  cup.position.y = -height / 2;
  body.add(cup);
  // A band of color round the tea mug, to tell them apart.
  if (drink === 'tea') {
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(radius + 0.0008, radius + 0.0008, 0.012, 28, 1, true),
      new THREE.MeshStandardMaterial({ name: 'MugBand', color: 0x2f5d8a, roughness: 0.4 }),
    );
    band.position.y = height * 0.22;
    body.add(band);
  }
  const surface = new THREE.Mesh(
    new THREE.CircleGeometry(radius - wall, 24),
    new THREE.MeshStandardMaterial({
      name: 'Drink',
      color: DRINK_COLORS[drink],
      roughness: 0.15,
      metalness: 0.1,
    }),
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = height / 2 - 0.014;
  body.add(surface);
  if (drink === 'cocoa') {
    // Two marshmallows bobbing on top.
    const marshmallow = new THREE.MeshStandardMaterial({
      name: 'Marshmallow',
      color: 0xfaf3ea,
      roughness: 0.8,
    });
    const shape = new THREE.BoxGeometry(0.014, 0.01, 0.014);
    for (const [x, z, turn] of [
      [-0.01, 0.006, 0.4],
      [0.012, -0.008, 1.1],
    ] as const) {
      const piece = new THREE.Mesh(shape, marshmallow);
      piece.position.set(x, surface.position.y + 0.004, z);
      piece.rotation.y = turn;
      body.add(piece);
    }
  }
  // The handle: a half ring on the +X side, the hand's grip through it.
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0065, 8, 18, Math.PI), ceramic);
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(radius - 0.002, 0.004, 0);
  body.add(handle);
  // Steam: three wisps above the drink.
  const steam = new THREE.SpriteMaterial({
    name: 'Steam',
    map: steamTexture(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  for (let i = 0; i < 3; i++) {
    const wisp = new THREE.Sprite(steam);
    wisp.name = 'Steam';
    wisp.userData.phase = i / 3;
    wisp.position.set((i - 1) * 0.01, height / 2 + 0.02, 0);
    wisp.scale.setScalar(0.035);
    body.add(wisp);
  }
  return mug;
}

/** How a wisp of steam looks `t` seconds on: rising, spreading, fading. */
export function steamWisp(
  t: number,
  phase: number,
): { rise: number; size: number; opacity: number } {
  const life = (t * 0.45 + phase) % 1;
  return {
    rise: life * 0.11,
    size: 0.03 + life * 0.05,
    opacity: Math.sin(life * Math.PI) * 0.32,
  };
}

/** The tea set on the little round table by the sofa: where to aim to
 * pour a cup, and where the pouring is heard. */
export const TEA_SET = { x: 1.41, y: 0.53, z: -3.56 };

/** Where the popcorn bowl stands: on a corner of the game table's wooden
 * frame (its rails run from 1.00 to 1.12 m out, their top at 0.82 m),
 * nearest the sofa — clear of the map. */
export const SNACK_BOWL = { x: 1.06, y: 0.82, z: -1.06 };
/** Built at 7.4 cm across the rim; this fits it on the rails exactly. */
const BOWL_SCALE = 0.8;

/** A little turned-wood bowl heaped with popcorn. */
export function buildSnackBowl(wood: THREE.Material | null): THREE.Group {
  const bowl = new THREE.Group();
  bowl.name = 'snack-bowl';
  bowl.position.set(SNACK_BOWL.x, SNACK_BOWL.y, SNACK_BOWL.z);
  bowl.scale.setScalar(BOWL_SCALE);
  const profile = [
    new THREE.Vector2(0.0001, 0.006),
    new THREE.Vector2(0.05, 0.008),
    new THREE.Vector2(0.066, 0.03),
    new THREE.Vector2(0.07, 0.05),
    new THREE.Vector2(0.074, 0.05),
    new THREE.Vector2(0.07, 0.024),
    new THREE.Vector2(0.045, 0.004),
    new THREE.Vector2(0.035, 0),
    new THREE.Vector2(0.0001, 0),
  ];
  const material =
    wood ?? new THREE.MeshStandardMaterial({ name: 'BowlWood', color: 0x6a3b20, roughness: 0.55 });
  bowl.add(new THREE.Mesh(new THREE.LatheGeometry(profile, 32), material));
  // Popcorn: little lumpy kernels, heaped in a dome.
  const kernel = new THREE.IcosahedronGeometry(0.011, 0);
  const positions = kernel.attributes.position!;
  // Lumpy, the same at every corner shared by several faces (the shape's
  // faces don't share vertices, so this goes by where the corner is).
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const hash = Math.sin(x * 1289.8 + y * 7823.3 + z * 3771.9) * 43758.5453;
    const wobble = 0.8 + (hash - Math.floor(hash)) * 0.45;
    positions.setXYZ(i, x * wobble, y * wobble, z * wobble);
  }
  kernel.computeVertexNormals();
  const popcorn = new THREE.MeshStandardMaterial({
    name: 'Popcorn',
    color: 0xf6e7c1,
    roughness: 0.85,
    flatShading: true,
  });
  const count = 70;
  const heap = new THREE.InstancedMesh(kernel, popcorn, count);
  const place = new THREE.Object3D();
  const golden = new THREE.Color(0xe8c46a);
  const cream = new THREE.Color(0xf8ecd0);
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * 0.06;
    const top = 0.05 + 0.028 * (1 - (r / 0.062) ** 2);
    place.position.set(Math.cos(angle) * r, 0.02 + random() * (top - 0.02), Math.sin(angle) * r);
    place.rotation.set(random() * 6, random() * 6, random() * 6);
    place.scale.setScalar(0.8 + random() * 0.5);
    place.updateMatrix();
    heap.setMatrixAt(i, place.matrix);
    heap.setColorAt(i, cream.clone().lerp(golden, random() * 0.6));
  }
  bowl.add(heap);
  return bowl;
}
