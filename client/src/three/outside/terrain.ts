/**
 * The land around the cottage (docs/decisions.md, "The world outside"): pure
 * functions, so the shape of the world is unit-tested and the same for
 * every player. Three.js world axes: -z is north, +x east; the room's floor
 * is y = 0 and its walls stand at x = ±5, z = ±4.
 */
import { seededRandom } from '../parchment.js';

/** The flat yard right around the house. */
export const YARD_RADIUS = 16;
/** A lake to the north-east, right under the moon. */
export const LAKE = { x: 62, z: -78, rx: 46, rz: 36, level: -0.4 };
/** The village on its hill, north-north-west. */
export const VILLAGE = { x: -75, z: -215, radius: 34 };
/** A windmill on a hill due east, seen from the east windows. */
export const WINDMILL = { x: 118, z: 6 };
/** The old graveyard, just past the yard to the west. */
export const GRAVEYARD = { minX: -30, maxX: -17, minZ: -9, maxZ: 9 };
/** Where the moon hangs: low in the north-north-east, over the lake —
 * framed by the north window. */
export const MOON_DIRECTION = normalize({ x: 0.495, y: 0.139, z: -0.857 });

function normalize(v: { x: number; y: number; z: number }) {
  const length = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 1 well inside the lake, 0 outside, soft in between. */
export function lakeFactor(x: number, z: number): number {
  const d = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
  return 1 - smoothstep(0.82, 1.05, d);
}

/** The ground's height (metres) at a point. */
export function groundHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  // Flat yard, then gently rolling meadows and woods...
  const rolling =
    2.2 * Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017) +
    1.2 * Math.sin((x + z) * 0.043) +
    0.5 * Math.sin(x * 0.11) * Math.sin(z * 0.09);
  let height = smoothstep(YARD_RADIUS, 70, r) * (2.4 + rolling);
  // ...rising to hills further out.
  const angle = Math.atan2(z, x);
  height +=
    smoothstep(110, 320, r) * (16 + 12 * Math.sin(angle * 3 + 0.7) + 6 * Math.sin(angle * 7));
  // The village's hill, and the windmill's.
  const village = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
  height += 20 * Math.exp(-((village / 70) ** 2));
  const mill = Math.hypot(x - WINDMILL.x, z - WINDMILL.z);
  height += 13 * Math.exp(-((mill / 38) ** 2));
  // The yard itself stays exactly level with the floor.
  height *= smoothstep(YARD_RADIUS, YARD_RADIUS + 20, r);
  // The lake's basin.
  const lake = lakeFactor(x, z);
  return height * (1 - lake) + (LAKE.level - 1.4) * lake;
}

export interface TreeSpot {
  x: number;
  z: number;
  scale: number;
  turn: number;
}

/** Whether a tree may stand here: not in the yard, the lake, the village,
 * the graveyard or the view north towards the village. */
export function treeAllowed(x: number, z: number): boolean {
  const r = Math.hypot(x, z);
  if (r < YARD_RADIUS + 6) return false;
  if (
    lakeFactor(x, z) > 0 ||
    Math.hypot((x - LAKE.x) / (LAKE.rx + 8), (z - LAKE.z) / (LAKE.rz + 8)) < 1
  ) {
    return false;
  }
  if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE.radius + 12) return false;
  if (
    x > GRAVEYARD.minX - 3 &&
    x < GRAVEYARD.maxX + 3 &&
    z > GRAVEYARD.minZ - 3 &&
    z < GRAVEYARD.maxZ + 3
  ) {
    return false;
  }
  // A clear meadow in front of the north window, so the village shows,
  // and a field east, so the windmill does.
  if (z < -12 && z > -150 && x > -45 && x < 25 && Math.abs(x - z * 0.3) < 30) return false;
  if (
    x > 14 &&
    x < WINDMILL.x + 25 &&
    Math.abs(z - WINDMILL.z * (x / WINDMILL.x)) < 16 + x * 0.12
  ) {
    return false;
  }
  return true;
}

/** The forest: seeded, so every player stands in the same woods. Denser
 * near the house's west side, thinning out towards the hills. */
export function scatterTrees(count: number, seed = 0x7ee5): TreeSpot[] {
  const random = seededRandom(seed);
  const spots: TreeSpot[] = [];
  let attempts = 0;
  while (spots.length < count && attempts < count * 40) {
    attempts += 1;
    const angle = random() * Math.PI * 2;
    // Biased towards nearer rings, so the woods feel close.
    const r = 22 + random() ** 1.6 * 190;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    if (!treeAllowed(x, z)) continue;
    spots.push({ x, z, scale: 0.7 + random() * 0.8, turn: random() * Math.PI * 2 });
  }
  return spots;
}
