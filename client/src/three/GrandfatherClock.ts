import * as THREE from 'three';

/** The clock face looks into the room along +X; its hands turn about it. */
const FACE_AXIS = new THREE.Vector3(1, 0, 0);

/** Where the hands point for `time`: clockwise angles (radians) from 12. Pure. */
export function handAngles(time: Date): { hour: number; minute: number } {
  const seconds = time.getSeconds() + time.getMilliseconds() / 1000;
  const minutes = time.getMinutes() + seconds / 60;
  const hours = (time.getHours() % 12) + minutes / 60;
  return { hour: (hours / 12) * Math.PI * 2, minute: (minutes / 60) * Math.PI * 2 };
}

/** How many strikes the clock gives at `time`, or 0 — the hour on the hour
 * (twelve at noon and midnight), one on the half hour. Pure. */
export function strikesAt(time: Date): number {
  if (time.getMinutes() === 0) return time.getHours() % 12 || 12;
  if (time.getMinutes() === 30) return 1;
  return 0;
}

export interface ClockSounds {
  tick(tock: boolean): void;
  /** The chime: `strikes` bells, a couple of seconds apart. */
  chime(strikes: number): void;
}

/**
 * The grandfather clock keeps real time — the player's own — with its hands
 * (`…_HourHand`/`…_MinuteHand` in the model, both modelled at 12), ticks
 * each second, and chimes the hours and half hours.
 */
export class GrandfatherClock {
  private readonly hands: { node: THREE.Object3D; rest: THREE.Quaternion; hour: boolean }[];
  private lastSecond = -1;
  private lastChimeMinute = -1;
  readonly spot: { x: number; z: number };

  private constructor(
    hour: THREE.Object3D,
    minute: THREE.Object3D,
    private readonly sounds: ClockSounds,
  ) {
    this.hands = [
      { node: hour, rest: hour.quaternion.clone(), hour: true },
      { node: minute, rest: minute.quaternion.clone(), hour: false },
    ];
    const at = minute.getWorldPosition(new THREE.Vector3());
    this.spot = { x: at.x, z: at.z };
  }

  static fromRoom(root: THREE.Object3D, sounds: ClockSounds): GrandfatherClock | null {
    const hour = root.getObjectByName('vintage_grandfather_clock_01_HourHand');
    const minute = root.getObjectByName('vintage_grandfather_clock_01_MinuteHand');
    return hour && minute ? new GrandfatherClock(hour, minute, sounds) : null;
  }

  update(now = new Date()): void {
    const angles = handAngles(now);
    for (const hand of this.hands) {
      // Clockwise, seen from the room: a negative turn about the face axis.
      hand.node.quaternion
        .copy(hand.rest)
        .premultiply(
          new THREE.Quaternion().setFromAxisAngle(
            FACE_AXIS,
            -(hand.hour ? angles.hour : angles.minute),
          ),
        );
    }
    const second = now.getSeconds();
    if (second !== this.lastSecond) {
      // (Not on the very first frame: that isn't a tick, just arriving.)
      if (this.lastSecond !== -1) this.sounds.tick(second % 2 === 1);
      this.lastSecond = second;
    }
    const minuteStamp = Math.floor(now.getTime() / 60000);
    if (second < 2 && minuteStamp !== this.lastChimeMinute) {
      this.lastChimeMinute = minuteStamp;
      const strikes = strikesAt(now);
      if (strikes > 0) this.sounds.chime(strikes);
    }
  }
}
