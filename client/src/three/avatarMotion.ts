/**
 * Pure motion logic for other players' character avatars (PlayerAvatars.ts)
 * — kept free of Three.js so it's unit-testable: smoothing between the
 * ~10 Hz `player:move` updates, choosing idle/walk/run from real speed, and
 * deciding which chair a seated player sits on.
 */

/** Exponential smoothing factor for one frame: how far to move toward a
 * target in `dt` seconds so that half the remaining gap closes every
 * `halfLife` seconds — frame-rate independent. */
export function smoothingFactor(dt: number, halfLife: number): number {
  if (halfLife <= 0) {
    return 1;
  }
  return 1 - Math.pow(0.5, dt / halfLife);
}

/** The signed shortest rotation from `from` to `to` (radians, in (-π, π]). */
export function shortestAngle(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta <= -Math.PI) delta += Math.PI * 2;
  return delta;
}

/** Turns `from` toward `to` by `factor` (0..1) along the shorter way round. */
export function lerpAngle(from: number, to: number, factor: number): number {
  return from + shortestAngle(from, to) * factor;
}

export type Locomotion = 'Idle' | 'Walk' | 'Run';

/** Below this ground speed (m/s) the avatar stands still. */
export const IDLE_BELOW = 0.25;
/** At or above this ground speed (m/s) the avatar runs instead of walks. */
export const RUN_FROM = 3.1;

export function locomotionFor(speed: number): Locomotion {
  if (speed < IDLE_BELOW) return 'Idle';
  return speed < RUN_FROM ? 'Walk' : 'Run';
}

/** The clips' own natural ground speeds (m/s) — used to scale playback so
 * feet don't skate at speeds the animation wasn't authored for. */
const CLIP_SPEED: Record<Locomotion, number> = { Idle: 1, Walk: 1.7, Run: 4.2 };

export function playbackRate(locomotion: Locomotion, speed: number): number {
  if (locomotion === 'Idle') return 1;
  return Math.min(1.5, Math.max(0.6, speed / CLIP_SPEED[locomotion]));
}

export interface Seat {
  x: number;
  z: number;
  /** Which way someone sitting here faces (radians, same convention as
   * `Player.rotationY`: yaw 0 faces +Z). */
  yaw: number;
}

export interface SeatedPlayer {
  id: string;
  x: number;
  z: number;
}

/**
 * Assigns seated players to chairs: each, in id order, takes the nearest
 * chair nobody has taken yet; anyone left over when chairs run out gets
 * `null` (sits on the spot). Deterministic in its inputs — every client
 * computes it from the same GameState, so everyone sees the same player on
 * the same chair without the server having to track seats.
 */
export function assignSeats(players: SeatedPlayer[], seats: Seat[]): Map<string, Seat | null> {
  const assignment = new Map<string, Seat | null>();
  const free = new Set(seats.map((_, index) => index));
  for (const player of [...players].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    let best: number | null = null;
    let bestDistance = Infinity;
    for (const index of free) {
      const seat = seats[index]!;
      const distance = Math.hypot(seat.x - player.x, seat.z - player.z);
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    }
    if (best === null) {
      assignment.set(player.id, null);
    } else {
      free.delete(best);
      assignment.set(player.id, seats[best]!);
    }
  }
  return assignment;
}
