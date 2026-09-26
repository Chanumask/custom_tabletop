import type { FloorSurface } from './roomSounds.js';

/** Metres between footfalls: a walking stride, and a longer running one. */
const WALK_STRIDE = 0.85;
const RUN_STRIDE = 1.25;
/** Faster than this (m/s) is running (walking is 2.2, running 4.2). */
const RUN_SPEED = 3.2;
/** A jump longer than this in one update is a teleport, not steps. */
const TELEPORT = 1.5;

export interface Step {
  running: boolean;
}

/**
 * Turns someone's movement into footfalls: every stride's worth of ground
 * covered is one step. Pure (fed positions, gives back steps), so the same
 * counter serves the player's own feet and everyone else's.
 */
export class StepCounter {
  private last: { x: number; z: number } | null = null;
  // Starts half a stride in, so the first step lands soon after setting off.
  private travelled = WALK_STRIDE / 2;

  /** Forget where they were: the next position starts fresh (after
   * sitting, say — getting up isn't a step). */
  reset(): void {
    this.last = null;
  }

  /** Where they are now, `dt` seconds after the last call — a step, or null. */
  advance(x: number, z: number, dt: number): Step | null {
    const last = this.last;
    this.last = { x, z };
    if (!last || dt <= 0) return null;
    const moved = Math.hypot(x - last.x, z - last.z);
    if (moved > TELEPORT) {
      this.travelled = WALK_STRIDE / 2;
      return null;
    }
    if (moved < 1e-4) {
      // Standing still: the next walk starts half a stride from a step.
      this.travelled = Math.min(this.travelled, WALK_STRIDE / 2);
      return null;
    }
    const running = moved / dt > RUN_SPEED;
    this.travelled += moved;
    const stride = running ? RUN_STRIDE : WALK_STRIDE;
    if (this.travelled < stride) return null;
    this.travelled -= stride;
    return { running };
  }
}

/** An axis-aligned rectangle of floor, e.g. a rug. */
export interface FloorArea {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** What's underfoot at (x, z): a rug, or the bare boards. Pure. */
export function surfaceAt(x: number, z: number, rugs: readonly FloorArea[]): FloorSurface {
  return rugs.some((rug) => x >= rug.minX && x <= rug.maxX && z >= rug.minZ && z <= rug.maxZ)
    ? 'rug'
    : 'wood';
}
