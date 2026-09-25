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

/**
 * The chair to sit on: the nearest one (to where the player stands) that
 * nobody else is on, or null when every chair is taken. The sitting
 * player's client picks it once and sends it along (`Player.seatIndex`);
 * the server keeps chairs unique, so the choice is stable for everyone.
 */
export function pickChair(
  seats: readonly Seat[],
  taken: ReadonlySet<number>,
  from: { x: number; z: number },
): number | null {
  let best: number | null = null;
  let bestDistance = Infinity;
  seats.forEach((seat, index) => {
    if (taken.has(index)) {
      return;
    }
    const distance = Math.hypot(seat.x - from.x, seat.z - from.z);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}
