import * as THREE from 'three';
import { CAT_SPOTS, catPath, type CatSpotId, type PathPoint } from './catRoutes.js';

/** The cat's name, for the prompt. */
export const CAT_NAME = 'Ember';

const WALK_SPEED = 0.55;
const JUMP_SECONDS = 0.5;
const STAND_SECONDS = 0.8;
const PET_SECONDS = 4;

/** Every part's placement in one pose: curled up asleep, or up on its feet. */
interface Pose {
  body: [number, number, number, number, number, number]; // position xyz, scale xyz
  head: [number, number, number, number, number]; // position xyz, rotation x, z
  tailBend: number; // each segment's turn about Y (wrapping round) ...
  tailLift: number; // ... and about X (raised)
  legs: number; // leg length scale (0 = tucked away)
}

const CURLED: Pose = {
  body: [0, 0.075, 0, 0.165, 0.078, 0.158],
  head: [0.07, 0.085, 0.115, 0.35, 0.55],
  // Round the outside of the body: a segment's length over the body's
  // radius and a bit.
  tailBend: 0.32,
  tailLift: 0,
  legs: 0.01,
};
const STANDING: Pose = {
  body: [0, 0.2, 0, 0.095, 0.095, 0.195],
  head: [0, 0.29, 0.2, -0.1, 0],
  tailBend: 0.05,
  tailLift: 0.5,
  legs: 1,
};

type State =
  | { kind: 'resting'; spot: CatSpotId }
  | { kind: 'walking'; path: PathPoint[]; leg: number; t: number; to: CatSpotId };

/**
 * The room's cat (docs/decisions.md, "The cozy room"): curled up asleep by
 * the fire — or on the sofa, the armchair, the chest — breathing slowly,
 * wandering to another spot now and then (catRoutes.ts decides where, the
 * same for everyone), and waking for a moment to be petted. Made of a few
 * shapes, flat-shaded like the characters.
 */
export class RoomCat {
  readonly group = new THREE.Group();
  /** Where to aim to pet it (moves with it). */
  readonly aimPoint = new THREE.Vector3();
  private readonly body: THREE.Mesh;
  private readonly head = new THREE.Group();
  private readonly eyes: THREE.Mesh[] = [];
  private readonly ears: THREE.Mesh[] = [];
  private readonly legs: THREE.Group[] = [];
  private readonly tail: THREE.Group[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private state: State | null = null;
  /** 0 curled, 1 up on its feet. */
  private up = 0;
  private time = 0;
  private stride = 0;
  private heading: number | null = null;
  private pettedAt = -Infinity;

  constructor(scene: THREE.Scene) {
    this.group.name = 'room-cat';
    scene.add(this.group);
    const fur = this.keep(
      new THREE.MeshStandardMaterial({ color: 0xc9772e, roughness: 0.95, flatShading: true }),
    );
    const cream = this.keep(
      new THREE.MeshStandardMaterial({ color: 0xf1e1c6, roughness: 0.95, flatShading: true }),
    );
    const pink = this.keep(
      new THREE.MeshStandardMaterial({ color: 0xe0a0a0, roughness: 0.8, flatShading: true }),
    );
    const dark = this.keep(new THREE.MeshStandardMaterial({ color: 0x1b1612, roughness: 0.4 }));
    const ball = this.keep(new THREE.SphereGeometry(1, 10, 8));

    this.body = new THREE.Mesh(ball, fur);
    this.group.add(this.body);
    // A cream chest under the chin.
    const chest = new THREE.Mesh(ball, cream);
    chest.scale.set(0.55, 0.7, 0.35);
    chest.position.set(0, -0.15, 0.72);
    this.body.add(chest);

    // The head: round, two ears, a muzzle, a nose, eyes that open.
    this.group.add(this.head);
    const skull = new THREE.Mesh(ball, fur);
    skull.scale.set(0.075, 0.066, 0.07);
    this.head.add(skull);
    const muzzle = new THREE.Mesh(ball, cream);
    muzzle.scale.set(0.034, 0.024, 0.026);
    muzzle.position.set(0, -0.018, 0.056);
    this.head.add(muzzle);
    const nose = new THREE.Mesh(ball, pink);
    nose.scale.set(0.009, 0.006, 0.006);
    nose.position.set(0, -0.004, 0.078);
    this.head.add(nose);
    const earShape = this.keep(new THREE.ConeGeometry(0.032, 0.062, 4));
    const innerShape = this.keep(new THREE.ConeGeometry(0.02, 0.04, 4));
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(earShape, fur);
      ear.position.set(side * 0.042, 0.062, -0.008);
      ear.rotation.set(-0.15, Math.PI / 4, side * -0.3);
      const inner = new THREE.Mesh(innerShape, pink);
      inner.position.set(0, -0.004, 0.009);
      ear.add(inner);
      this.head.add(ear);
      this.ears.push(ear);
      const eye = new THREE.Mesh(ball, dark);
      eye.scale.set(0.011, 0.011, 0.006);
      eye.position.set(side * 0.028, 0.012, 0.058);
      this.head.add(eye);
      this.eyes.push(eye);
    }

    // Legs, hung from the hips and shoulders, with cream paws.
    const legShape = this.keep(new THREE.CylinderGeometry(0.02, 0.016, 0.13, 6));
    legShape.translate(0, -0.065, 0);
    for (const [x, z] of [
      [-0.055, 0.12],
      [0.055, 0.12],
      [-0.055, -0.12],
      [0.055, -0.12],
    ] as const) {
      const leg = new THREE.Group();
      leg.position.set(x, 0.13, z);
      leg.add(new THREE.Mesh(legShape, fur));
      const paw = new THREE.Mesh(ball, cream);
      paw.scale.set(0.022, 0.014, 0.028);
      paw.position.set(0, -0.128, 0.006);
      leg.add(paw);
      this.group.add(leg);
      this.legs.push(leg);
    }

    // The tail: a chain of segments, each turning a little from the last.
    const tailShape = this.keep(new THREE.CylinderGeometry(0.017, 0.02, 0.062, 6));
    tailShape.rotateX(Math.PI / 2);
    tailShape.translate(0, 0, -0.031);
    let parent: THREE.Object3D = this.group;
    for (let i = 0; i < 7; i++) {
      const segment = new THREE.Group();
      segment.position.set(0, 0, i === 0 ? 0 : -0.058);
      const piece = new THREE.Mesh(tailShape, i === 6 ? cream : fur);
      piece.scale.setScalar(1 - i * 0.06);
      segment.add(piece);
      parent.add(segment);
      this.tail.push(segment);
      parent = segment;
    }
  }

  /** Follow `target` (catRoutes.ts's `catTarget`): walk there if it isn't
   * there already. The first call puts it straight there. */
  update(dt: number, target: CatSpotId, reducedMotion: boolean): void {
    this.time += dt;
    if (!this.state) this.state = { kind: 'resting', spot: target };
    const state = this.state;
    let at: { x: number; y: number; z: number; yaw: number };
    if (state.kind === 'resting') {
      if (state.spot !== target && this.time - this.pettedAt > 1.5) {
        this.state = {
          kind: 'walking',
          path: catPath(state.spot, target),
          leg: 0,
          t: 0,
          to: target,
        };
      }
      const spot = CAT_SPOTS[state.spot];
      this.up = Math.max(0, this.up - dt / STAND_SECONDS);
      at = { x: spot.x, y: spot.y, z: spot.z, yaw: spot.yaw };
    } else {
      // Up onto its feet first, then along the path.
      this.up = Math.min(1, this.up + dt / STAND_SECONDS);
      at = this.walk(state, this.up >= 1 ? dt : 0);
    }
    this.group.position.set(at.x, at.y, at.z);
    // Turning to settle, rather than snapping round.
    if (this.heading === null) this.heading = at.yaw;
    const turn = Math.atan2(Math.sin(at.yaw - this.heading), Math.cos(at.yaw - this.heading));
    this.heading += turn * Math.min(1, dt * 6);
    this.group.rotation.y = this.heading;
    this.pose(reducedMotion);
    this.aimPoint.set(at.x, at.y + 0.1 + this.up * 0.08, at.z);
  }

  /** Stroked: it wakes, lifts its head, purrs. Only while it's lying down. */
  pet(): boolean {
    if (this.state?.kind !== 'resting') return false;
    this.pettedAt = this.time;
    return true;
  }

  /** Whether it's lying down (to be petted), and where it is. */
  get resting(): boolean {
    return this.state?.kind === 'resting';
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.disposables.forEach((item) => item.dispose());
  }

  private walk(
    state: Extract<State, { kind: 'walking' }>,
    dt: number,
  ): { x: number; y: number; z: number; yaw: number } {
    let left = dt;
    while (state.leg < state.path.length - 1) {
      const a = state.path[state.leg]!;
      const b = state.path[state.leg + 1]!;
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const seconds = b.jump || a.y !== b.y ? JUMP_SECONDS : Math.max(length / WALK_SPEED, 0.05);
      const step = left / seconds;
      if (state.t + step < 1) {
        state.t += step;
        left = 0;
        break;
      }
      left -= (1 - state.t) * seconds;
      state.leg += 1;
      state.t = 0;
    }
    if (state.leg >= state.path.length - 1) {
      // Arrived: turn to settle, and curl up.
      this.state = { kind: 'resting', spot: state.to };
      const spot = CAT_SPOTS[state.to];
      return { x: spot.x, y: spot.y, z: spot.z, yaw: spot.yaw };
    }
    const a = state.path[state.leg]!;
    const b = state.path[state.leg + 1]!;
    const jumping = b.jump || a.y !== b.y;
    const t = state.t;
    const hop = jumping ? Math.sin(t * Math.PI) * 0.22 : 0;
    this.stride += jumping ? 0 : dt * WALK_SPEED * 11;
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t + hop,
      z: a.z + (b.z - a.z) * t,
      yaw: Math.atan2(b.x - a.x, b.z - a.z),
    };
  }

  private pose(reducedMotion: boolean): void {
    const w = this.up * this.up * (3 - 2 * this.up);
    const mix = (a: number, b: number) => a + (b - a) * w;
    // Awake a moment when petted: the head comes up, the eyes open.
    const since = this.time - this.pettedAt;
    const awake =
      since < PET_SECONDS ? Math.min(1, since / 0.4) * Math.min(1, (PET_SECONDS - since) / 0.8) : 0;
    const open = Math.max(w, awake);
    // Breathing, slow while asleep.
    const breath = reducedMotion ? 0 : Math.sin(this.time * (1.6 + awake)) * 0.035 * (1 - w);
    const [bx, by, bz, sx, sy, sz] = CURLED.body.map((value, i) => mix(value, STANDING.body[i]!));
    const bob = w * Math.abs(Math.sin(this.stride)) * 0.008;
    this.body.position.set(bx!, by! + bob, bz!);
    this.body.scale.set(sx! * (1 + breath * 0.5), sy! * (1 + breath), sz!);
    const [hx, hy, hz, hrx, hrz] = CURLED.head.map((value, i) => mix(value, STANDING.head[i]!));
    this.head.position.set(hx!, hy! + awake * 0.045 * (1 - w) + bob, hz! + awake * 0.02 * (1 - w));
    this.head.rotation.set(hrx! - awake * 0.45 * (1 - w), 0, hrz! * (1 - awake * 0.7));
    for (const eye of this.eyes) eye.scale.y = 0.011 * (0.12 + 0.88 * open);
    // An ear flicks now and then, and when stroked.
    const flick =
      Math.max(0, Math.sin(this.time * 0.7) - 0.97) * 20 +
      awake * Math.max(0, Math.sin(since * 9)) * 0.6;
    this.ears.forEach((ear, i) => (ear.rotation.x = -0.15 - flick * (i === 0 ? 0.4 : 0.1)));
    // Legs: tucked away asleep; walking, diagonal pairs together.
    const legScale = mix(CURLED.legs, STANDING.legs);
    this.legs.forEach((leg, i) => {
      leg.scale.y = legScale;
      leg.visible = legScale > 0.05;
      const pair = i === 0 || i === 3 ? 0 : Math.PI;
      leg.rotation.x = w * Math.sin(this.stride + pair) * 0.55;
    });
    // The tail: wrapped round the front asleep (a twitch when stroked),
    // up in a gentle curve walking.
    const sway = reducedMotion ? 0 : Math.sin(this.time * 1.3) * 0.12;
    this.tail.forEach((segment, i) => {
      // Asleep, it starts at the back edge heading round the side (-X);
      // up, straight out behind.
      if (i === 0) {
        segment.position.set(0, mix(0.035, 0.22), mix(-0.155, -0.18));
      }
      const start = i === 0 ? mix(Math.PI / 2, 0) : 0;
      const twitch = i > 3 ? awake * Math.sin(since * 7 + i) * 0.25 : 0;
      segment.rotation.set(
        mix(CURLED.tailLift, STANDING.tailLift) * (i < 3 ? 1 : -0.4),
        start + mix(CURLED.tailBend, STANDING.tailBend) + twitch + (i > 2 ? sway * w : 0),
        0,
      );
    });
  }

  private keep<T extends { dispose(): void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }
}
