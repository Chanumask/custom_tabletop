import type { LoungeSeat } from '@custom-tabletop/shared';

/**
 * Where the room's cat likes to be, and how it gets there (docs/decisions.md,
 * "The cozy room, lived in"). Pure: RoomCat.ts animates it. Everyone's room works out
 * the same spot from the server's clock, so the cat is in the same place for
 * every player; only its walk between spots is each room's own.
 */

export type CatSpotId = 'fire' | 'sofa' | 'armchair';

export interface CatSpot {
  id: CatSpotId;
  /** Where it lies (feet), and which way its face points (yaw 0 = +Z). */
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Where it stands on the floor to jump up (the spot itself if it's on
   * the floor). */
  floor: { x: number; z: number };
  /** Its way onto the ring round the table. */
  ring: number;
  /** A player sitting here sends the cat elsewhere. */
  seat: LoungeSeat | null;
}

export const CAT_SPOTS: Record<CatSpotId, CatSpot> = {
  // On the rug in front of the fire, facing the room.
  fire: {
    id: 'fire',
    x: -3.3,
    y: 0.012,
    z: 0.35,
    yaw: Math.PI / 2,
    floor: { x: -3.3, z: 0.35 },
    ring: 6,
    seat: null,
  },
  // The sofa's east cushion.
  sofa: {
    id: 'sofa',
    x: 3.54,
    y: 0.46,
    z: -3.42,
    yaw: 0,
    // Off the front corner by the arm — not through the legs of whoever
    // sits beside her (or just sat down where she was).
    floor: { x: 3.95, z: -2.85 },
    ring: 1,
    seat: 'sofa-east',
  },
  // The armchair by the reading lamp.
  armchair: {
    id: 'armchair',
    x: -4.05,
    y: 0.49,
    z: 3.1,
    yaw: 2.22,
    // Off the front-left corner: clear of the chair's own footprint, the
    // side table, and a sitter's knees.
    floor: { x: -4.1, z: 2.35 },
    ring: 5,
    seat: 'armchair',
  },
};

/** The floor round the table, clear of the chairs: eight points, in order. */
export const RING: readonly { x: number; z: number }[] = [
  { x: 0, z: -2.3 },
  { x: 2.3, z: -2.3 },
  { x: 2.3, z: 0 },
  { x: 2.3, z: 2.3 },
  { x: 0, z: 2.3 },
  { x: -2.3, z: 2.3 },
  { x: -2.3, z: 0 },
  { x: -2.3, z: -2.3 },
];

/** How long the cat stays put before it might move on (ms). */
export const CAT_NAP_MS = 7 * 60_000;

/** How much the cat likes each spot. */
const LIKING: [CatSpotId, number][] = [
  ['fire', 0.45],
  ['sofa', 0.3],
  ['armchair', 0.25],
];

/** Where the cat means to be at `now` (server clock, ms) — the same for
 * everyone. Pure. */
export function scheduledSpot(now: number): CatSpotId {
  const nap = Math.floor(now / CAT_NAP_MS);
  // A small hash of the nap's number: the same everywhere.
  let h = Math.imul(nap ^ 0x5bd1e995, 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x165667b1);
  const roll = ((h >>> 0) % 1000) / 1000;
  let sum = 0;
  for (const [spot, weight] of LIKING) {
    sum += weight;
    if (roll < sum) return spot;
  }
  return 'fire';
}

/** Whether a player is sitting where the cat would lie. */
export function spotTaken(
  spot: CatSpotId,
  players: readonly { lounge: LoungeSeat | null }[],
): boolean {
  const seat = CAT_SPOTS[spot].seat;
  return seat !== null && players.some((player) => player.lounge === seat);
}

/** Where the cat goes: where it means to be, unless someone's sitting
 * there — then back to the fire. Pure. */
export function catTarget(
  now: number,
  players: readonly { lounge: LoungeSeat | null }[],
): CatSpotId {
  const spot = scheduledSpot(now);
  return spotTaken(spot, players) ? 'fire' : spot;
}

/** Her footprint while she sleeps on the floor (the fire rug), so nobody
 * walks through her — or null where she's up on a seat. */
export function catFloorObstacle(
  spot: CatSpotId,
): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  const { x, y, z } = CAT_SPOTS[spot];
  if (y > 0.1) return null;
  return { minX: x - 0.18, maxX: x + 0.18, minZ: z - 0.18, maxZ: z + 0.18 };
}

export interface PathPoint {
  x: number;
  y: number;
  z: number;
  /** Jumping onto (or down from) this point, rather than walking. */
  jump: boolean;
}

/** The way on from a point on the floor (partway along a walk, when where
 * she's going changed): onto the ring at its nearest point, round the
 * short way, up onto the spot. Pure. */
export function catPathFrom(point: { x: number; z: number }, to: CatSpotId): PathPoint[] {
  const b = CAT_SPOTS[to];
  let nearest = 0;
  RING.forEach((ring, i) => {
    const best = RING[nearest]!;
    if (
      Math.hypot(ring.x - point.x, ring.z - point.z) <
      Math.hypot(best.x - point.x, best.z - point.z)
    ) {
      nearest = i;
    }
  });
  const points: PathPoint[] = [{ x: point.x, y: 0.012, z: point.z, jump: false }];
  const n = RING.length;
  const forward = (b.ring - nearest + n) % n;
  const step = forward <= n / 2 ? 1 : -1;
  for (let i = nearest; ; i = (i + step + n) % n) {
    points.push({ x: RING[i]!.x, y: 0.012, z: RING[i]!.z, jump: false });
    if (i === b.ring) break;
  }
  if (b.y > 0.1) {
    points.push({ x: b.floor.x, y: 0.012, z: b.floor.z, jump: false });
    points.push({ x: b.x, y: b.y, z: b.z, jump: true });
  } else {
    points.push({ x: b.x, y: b.y, z: b.z, jump: false });
  }
  return points;
}

/** The way from one spot to another: down to the floor, round the table
 * the short way, up onto the other spot. Pure. */
export function catPath(from: CatSpotId, to: CatSpotId): PathPoint[] {
  const a = CAT_SPOTS[from];
  const b = CAT_SPOTS[to];
  const points: PathPoint[] = [{ x: a.x, y: a.y, z: a.z, jump: false }];
  if (from === to) return points;
  const floorOf = (spot: CatSpot) => ({ x: spot.floor.x, y: 0.012, z: spot.floor.z });
  if (a.y > 0.1) points.push({ ...floorOf(a), jump: true });
  // Round the ring, whichever way is shorter.
  const n = RING.length;
  const forward = (b.ring - a.ring + n) % n;
  const step = forward <= n / 2 ? 1 : -1;
  for (let i = a.ring; ; i = (i + step + n) % n) {
    points.push({ x: RING[i]!.x, y: 0.012, z: RING[i]!.z, jump: false });
    if (i === b.ring) break;
  }
  if (b.y > 0.1) {
    points.push({ ...floorOf(b), jump: false });
    points.push({ x: b.x, y: b.y, z: b.z, jump: true });
  } else {
    points.push({ x: b.x, y: b.y, z: b.z, jump: false });
  }
  return points;
}
