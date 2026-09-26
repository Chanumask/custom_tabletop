import * as THREE from 'three';
import type { LoungeSpot } from './loungeSeats.js';

/** How far it tips each way (radians), and one full rock (seconds). */
const AMPLITUDE = 0.075;
const PERIOD = 2.6;
/** Settling into a rock once someone sits, and slowing to a stop after
 * they get up (seconds, roughly). */
const START_SECONDS = 1.5;
const STOP_SECONDS = 4;

/** The swing, from how far into the rock (`phase`, radians) and how hard
 * it's rocking (`amount`, 0..1). Pure. */
export function rockAngle(phase: number, amount: number): number {
  return AMPLITUDE * amount * Math.sin(phase);
}

/**
 * The rocking chair (docs/decisions.md, "The cozy room, lived in"): rocks gently
 * while someone sits in it — the sitter with it, and their view — and
 * slows to a stop when they get up, creaking at the end of each swing.
 * Every player's room rocks it on its own (only who's sitting is shared),
 * so there's nothing to keep in step.
 */
export class RockingChair {
  private readonly tilt: THREE.Group | null = null;
  private phase = 0;
  private amount = 0;
  private swingingForward = true;
  /** The chair's tilt now (radians, `rotation.x` facing the seat's way). */
  angle = 0;

  constructor(
    root: THREE.Object3D,
    spot: LoungeSpot,
    /** At the end of each swing: how hard it's rocking (0..1). */
    private readonly onCreak: (amount: number) => void,
  ) {
    const chair = root.getObjectByName('Rockingchair_01');
    if (!chair) return;
    // Tips about the floor under the sitter's hips, across the seat.
    const pivot = new THREE.Group();
    pivot.name = 'rocking-chair-pivot';
    pivot.position.set(spot.x, 0, spot.z);
    pivot.rotation.y = spot.yaw;
    root.add(pivot);
    const tilt = new THREE.Group();
    pivot.add(tilt);
    pivot.updateMatrixWorld(true);
    tilt.attach(chair);
    this.tilt = tilt;
  }

  update(dt: number, occupied: boolean): void {
    if (!this.tilt) return;
    const want = occupied ? 1 : 0;
    const rate = dt / (occupied ? START_SECONDS : STOP_SECONDS);
    this.amount =
      want > this.amount ? Math.min(want, this.amount + rate) : Math.max(0, this.amount - rate);
    if (this.amount === 0) {
      this.angle = 0;
      this.tilt.rotation.x = 0;
      return;
    }
    this.phase = (this.phase + (dt * Math.PI * 2) / PERIOD) % (Math.PI * 2);
    this.angle = rockAngle(this.phase, this.amount);
    this.tilt.rotation.x = this.angle;
    // The end of a swing: the rockers turn over on the boards.
    const forward = Math.cos(this.phase) > 0;
    if (forward !== this.swingingForward) {
      this.swingingForward = forward;
      if (this.amount > 0.25) this.onCreak(this.amount);
    }
  }
}
