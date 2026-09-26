import type { LoungeSeat } from '@custom-tabletop/shared';

/** Where someone sits on each of the room's comfy seats (room.ts
 * `LOUNGE_SEATS`), measured off the room model: the sofa against the north
 * wall (three cushions), the armchair in the south-west corner by the
 * reading lamp, the rocking chair by the west wall. */
export interface LoungeSpot {
  /** The sitter's hips, on the floor plan. */
  x: number;
  z: number;
  /** Which way they face (yaw 0 faces +Z, like `Player.rotationY`). */
  yaw: number;
  /** How far the figure drops to sit (the table's chairs drop 0.44 m):
   * deeper into soft cushions. */
  drop: number;
  /** How far they lean back into it (radians). */
  recline: number;
  /** The seat's middle, to aim at when sitting down. */
  cushion: { x: number; y: number; z: number };
  /** "the sofa", "the armchair", "the rocking chair". */
  name: string;
  soft: boolean;
}

const deg = (degrees: number) => (degrees * Math.PI) / 180;
const SOFA_HIPS_Z = -3.47;
const ARMCHAIR_YAW = deg(127.2);
const ROCKING_YAW = deg(-41.1);

function sofa(x: number): LoungeSpot {
  return {
    x,
    z: SOFA_HIPS_Z,
    yaw: 0,
    drop: 0.47,
    recline: 0.2,
    cushion: { x, y: 0.5, z: -3.4 },
    name: 'the sofa',
    soft: true,
  };
}

export const LOUNGE_SPOTS: Record<LoungeSeat, LoungeSpot> = {
  'sofa-west': sofa(2.36),
  'sofa-middle': sofa(2.95),
  'sofa-east': sofa(3.54),
  armchair: {
    x: -4.085 - 0.1 * Math.sin(ARMCHAIR_YAW),
    z: 3.13 - 0.1 * Math.cos(ARMCHAIR_YAW),
    yaw: ARMCHAIR_YAW,
    drop: 0.45,
    recline: 0.16,
    cushion: {
      x: -4.085 + 0.05 * Math.sin(ARMCHAIR_YAW),
      y: 0.55,
      z: 3.13 + 0.05 * Math.cos(ARMCHAIR_YAW),
    },
    name: 'the armchair',
    soft: true,
  },
  'rocking-chair': {
    x: -3.535,
    z: -1.02,
    yaw: ROCKING_YAW,
    drop: 0.47,
    recline: 0.1,
    cushion: {
      x: -3.535 + 0.1 * Math.sin(ROCKING_YAW),
      y: 0.5,
      z: -1.02 + 0.1 * Math.cos(ROCKING_YAW),
    },
    name: 'the rocking chair',
    soft: false,
  },
};

/** Standing eye height, and how far the eyes sit above the hips. */
const STANDING_EYE = 1.66;
const EYES_ABOVE_HIPS = 0.75;
/** The face is a little forward of the spine. */
const FACE_FORWARD = 0.1;

/**
 * Where the sitter's eyes are: above their hips, lower and further back the
 * more they lean back — and, in the rocking chair, swung with it by `rock`:
 * the chair's tilt about its own left-right axis through the floor under
 * the hips (radians, as `rotation.x` in a frame facing the seat's way —
 * positive tips it forward). World coordinates.
 */
export function loungeEye(spot: LoungeSpot, rock = 0): { x: number; y: number; z: number } {
  const up = STANDING_EYE - spot.drop - EYES_ABOVE_HIPS * (1 - Math.cos(spot.recline));
  const forward = FACE_FORWARD - EYES_ABOVE_HIPS * Math.sin(spot.recline);
  const y = up * Math.cos(rock) - forward * Math.sin(rock);
  const along = up * Math.sin(rock) + forward * Math.cos(rock);
  return {
    x: spot.x + Math.sin(spot.yaw) * along,
    y,
    z: spot.z + Math.cos(spot.yaw) * along,
  };
}

/** Who's sitting on `seat`, if anyone — for the prompt ("Alice is sitting
 * there") and the rocking chair (rocking while someone's in it). */
export function sitterOn(
  seat: LoungeSeat,
  players: readonly { id: string; name: string; lounge: LoungeSeat | null }[],
): { id: string; name: string } | null {
  return players.find((player) => player.lounge === seat) ?? null;
}
