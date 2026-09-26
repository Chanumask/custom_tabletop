import * as THREE from 'three';
import type { Obstacle } from './collision.js';
import { mergeStatic } from './mergeStatic.js';
import { woodBox } from './woodBox.js';

/** The record cabinet stands against the south wall under the star-map
 * poster, between the TV's sideboard and the reading lamp, facing the room. */
const SPOT = { x: -2.15, z: 3.77 };
const WIDTH = 0.84;
const DEPTH = 0.42;
const LEG_HEIGHT = 0.16;
const BODY_HEIGHT = 0.44;
const TOP = LEG_HEIGHT + BODY_HEIGHT;
/** 33⅓ turns a minute; it takes a moment to come up to speed. */
const SPIN = (33.333 / 60) * Math.PI * 2;
const SPIN_UP_SECONDS = 1.2;
const PLATTER = { x: -0.05, z: 0.01, radius: 0.145 };
/** The tonearm: at rest by its post, or swung in over the record (the
 * stylus 11 cm out from the spindle). */
const ARM_REST = 0.12;
const ARM_PLAYING = -0.587;
const ARM_SECONDS = 0.9;
/** The tonearm's pivot height, lifted. */
const ARM_HEIGHT = TOP + 0.055 + 0.035;

/** Each record's label, and a soundboard sound's. */
const LABELS: Record<string, number> = {
  tavern: 0x9a3a20,
  lofi: 0x6d5a98,
  'rain-jazz': 0x27507a,
  sound: 0xc49a2c,
};

/** Old record sleeves' colors, faded. */
const SLEEVES = [
  0xd9c7a3, 0x8c3b2a, 0x2f5d62, 0xc79a3a, 0x6b2737, 0x2c3e5c, 0x6f7a3a, 0xb56a3c, 0x3b3b3b,
  0x9c8a6a,
];

/**
 * The record player (docs/decisions.md, "The cozy room, lived in"): a little walnut
 * record cabinet with its records on a shelf and a turntable on top. The
 * platter spins while a record plays, the tonearm swings over and back, a
 * small lamp glows. What plays is shared (GameState.room.record, played by
 * music/MusicPlayer.ts); this is only how it looks.
 */
export class RecordPlayer {
  readonly group = new THREE.Group();
  /** Where to aim to use it, and how big. */
  readonly aim = { center: new THREE.Vector3(SPOT.x, TOP + 0.08, SPOT.z), radius: 0.34 };
  /** Where its sound comes from. */
  readonly soundSpot = { x: SPOT.x, z: SPOT.z };
  /** Its footprint, to walk around. */
  readonly obstacle: Obstacle = {
    minX: SPOT.x - WIDTH / 2,
    maxX: SPOT.x + WIDTH / 2,
    minZ: SPOT.z - DEPTH / 2,
    maxZ: SPOT.z + DEPTH / 2,
  };
  private readonly spinner = new THREE.Group();
  private readonly record: THREE.Mesh;
  private readonly labelMaterial: THREE.MeshStandardMaterial;
  private readonly arm = new THREE.Group();
  private readonly lamp: THREE.MeshStandardMaterial;
  private readonly disposables: { dispose(): void }[] = [];
  private speed = 0;
  private armAngle = ARM_REST;
  private playing: string | null = null;

  constructor(scene: THREE.Scene, wood: THREE.Material | null) {
    this.group.name = 'record-player';
    this.group.position.set(SPOT.x, 0, SPOT.z);
    // Its front faces the room (north, -z).
    this.group.rotation.y = Math.PI;
    scene.add(this.group);

    const walnut =
      wood ?? this.keep(new THREE.MeshStandardMaterial({ color: 0x4a2c1a, roughness: 0.6 }));
    const brass = this.keep(
      new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 0.85, roughness: 0.3 }),
    );
    const steel = this.keep(
      new THREE.MeshStandardMaterial({ color: 0xc9ccd0, metalness: 0.9, roughness: 0.28 }),
    );
    const black = this.keep(
      new THREE.MeshStandardMaterial({ color: 0x161616, metalness: 0.2, roughness: 0.45 }),
    );

    // The cabinet: tapered legs, a body with a shelf of records on the
    // left and a door on the right.
    const legGeometry = this.keep(new THREE.CylinderGeometry(0.018, 0.011, LEG_HEIGHT, 10));
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      const leg = new THREE.Mesh(legGeometry, walnut);
      leg.position.set(x * (WIDTH / 2 - 0.06), LEG_HEIGHT / 2, z * (DEPTH / 2 - 0.06));
      leg.rotation.set(z * 0.06, 0, -x * 0.06);
      this.group.add(leg);
    }
    const slab = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(this.woodBox(w, h, d), walnut);
      mesh.position.set(x, y, z);
      this.group.add(mesh);
      return mesh;
    };
    slab(WIDTH, 0.03, DEPTH + 0.02, 0, TOP - 0.015, 0.0); // top
    slab(WIDTH - 0.04, 0.025, DEPTH - 0.02, 0, LEG_HEIGHT + 0.0125, 0); // bottom
    for (const side of [-1, 1])
      slab(
        0.025,
        BODY_HEIGHT - 0.03,
        DEPTH,
        side * (WIDTH / 2 - 0.0125),
        LEG_HEIGHT + (BODY_HEIGHT - 0.03) / 2,
        0,
      );
    slab(
      WIDTH - 0.05,
      BODY_HEIGHT - 0.03,
      0.015,
      0,
      LEG_HEIGHT + (BODY_HEIGHT - 0.03) / 2,
      -DEPTH / 2 + 0.0075,
    ); // back
    slab(
      0.02,
      BODY_HEIGHT - 0.05,
      DEPTH - 0.03,
      0.03,
      LEG_HEIGHT + 0.025 + (BODY_HEIGHT - 0.05) / 2,
      0,
    ); // divider
    const door = slab(
      0.35,
      BODY_HEIGHT - 0.06,
      0.018,
      0.225,
      LEG_HEIGHT + 0.03 + (BODY_HEIGHT - 0.06) / 2,
      DEPTH / 2 - 0.012,
    );
    const knob = new THREE.Mesh(this.keep(new THREE.SphereGeometry(0.012, 12, 8)), brass);
    knob.position.set(-0.14, 0, 0.016);
    door.add(knob);
    // Records on the shelf, leaning a little.
    // One material, each sleeve its own color in its vertices — so they
    // all merge into one mesh below.
    const sleeveMaterial = this.keep(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
    );
    for (let i = 0; i < 17; i++) {
      const shape = this.keep(new THREE.BoxGeometry(0.011, 0.31, 0.31));
      const color = new THREE.Color(SLEEVES[(i * 7) % SLEEVES.length]!);
      const colors = new Float32Array(shape.attributes.position!.count * 3);
      for (let v = 0; v < colors.length; v += 3) colors.set([color.r, color.g, color.b], v);
      shape.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const sleeve = new THREE.Mesh(shape, sleeveMaterial);
      const lean = i > 13 ? 0.28 : 0;
      sleeve.position.set(
        -0.36 + i * 0.0145 + (i > 13 ? (i - 13) * 0.02 : 0),
        LEG_HEIGHT + 0.025 + 0.155,
        0.015 + (i % 3) * 0.004,
      );
      sleeve.rotation.z = -lean;
      this.group.add(sleeve);
    }

    // The turntable on top: a plinth, the platter, a record, the tonearm.
    const plinth = new THREE.Mesh(this.woodBox(0.46, 0.055, 0.36), walnut);
    plinth.position.set(0, TOP + 0.0275, 0);
    this.group.add(plinth);
    const deck = TOP + 0.055;
    const platter = new THREE.Mesh(
      this.keep(new THREE.CylinderGeometry(PLATTER.radius, PLATTER.radius, 0.016, 48)),
      steel,
    );
    platter.position.y = 0.008;
    this.spinner.position.set(PLATTER.x, deck, PLATTER.z);
    this.spinner.add(platter);
    const mat = new THREE.Mesh(
      this.keep(
        new THREE.CylinderGeometry(PLATTER.radius - 0.004, PLATTER.radius - 0.004, 0.003, 48),
      ),
      this.keep(new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.95 })),
    );
    mat.position.y = 0.0175;
    this.spinner.add(mat);
    // The record: black vinyl with its grooves catching the light, and a label.
    const vinyl = this.keep(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: this.keep(grooves()),
        roughness: 0.26,
        metalness: 0.2,
      }),
    );
    this.record = new THREE.Mesh(this.keep(new THREE.CylinderGeometry(0.1524, 0.1524, 0.002, 64)), [
      black,
      vinyl,
      black,
    ]);
    this.record.position.y = 0.0205;
    this.spinner.add(this.record);
    this.labelMaterial = this.keep(
      new THREE.MeshStandardMaterial({ color: LABELS.tavern, roughness: 0.7 }),
    );
    const label = new THREE.Mesh(
      this.keep(new THREE.CylinderGeometry(0.047, 0.047, 0.0006, 40)),
      this.labelMaterial,
    );
    label.position.y = 0.0015;
    this.record.add(label);
    const spindle = new THREE.Mesh(
      this.keep(new THREE.CylinderGeometry(0.0035, 0.0035, 0.03, 8)),
      steel,
    );
    spindle.position.y = 0.022;
    this.spinner.add(spindle);
    this.group.add(this.spinner);

    // The tonearm: from its pivot at the back right, out to the headshell.
    this.arm.position.set(0.16, ARM_HEIGHT, -0.11);
    const base = new THREE.Mesh(
      this.keep(new THREE.CylinderGeometry(0.022, 0.026, 0.035, 20)),
      steel,
    );
    base.position.set(0.16, deck + 0.0175, -0.11);
    this.group.add(base);
    const tube = new THREE.Mesh(
      this.keep(new THREE.CylinderGeometry(0.0042, 0.0042, 0.23, 10)),
      steel,
    );
    tube.rotation.x = Math.PI / 2;
    tube.position.z = 0.115;
    const counterweight = new THREE.Mesh(
      this.keep(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 16)),
      black,
    );
    counterweight.rotation.x = Math.PI / 2;
    counterweight.position.z = -0.03;
    const head = new THREE.Mesh(this.keep(new THREE.BoxGeometry(0.02, 0.008, 0.04)), black);
    head.position.set(0, -0.004, 0.235);
    this.arm.add(tube, counterweight, head);
    this.group.add(this.arm);
    const rest = new THREE.Mesh(
      this.keep(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 8)),
      steel,
    );
    rest.position.set(0.19, deck + 0.015, 0.1);
    this.group.add(rest);
    // A speed knob, and a little lamp that glows while it plays.
    const knobSpeed = new THREE.Mesh(
      this.keep(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 16)),
      steel,
    );
    knobSpeed.position.set(-0.19, deck + 0.006, 0.15);
    this.group.add(knobSpeed);
    this.lamp = this.keep(
      new THREE.MeshStandardMaterial({ color: 0x5a2a10, emissive: 0xff8a3a, emissiveIntensity: 0 }),
    );
    const lamp = new THREE.Mesh(this.keep(new THREE.SphereGeometry(0.005, 10, 8)), this.lamp);
    lamp.position.set(0.19, TOP + 0.03, 0.182);
    this.group.add(lamp);
    this.record.visible = false;
    // Everything that doesn't move (or glow) as a few meshes, not forty.
    for (const geometry of mergeStatic(
      this.group,
      (part) => part === this.spinner || part === this.arm || part === lamp,
    )) {
      this.keep(geometry);
    }
  }

  /** What's on (a record id, `sound:<id>`) or null; `update` shows it. */
  setPlaying(record: string | null): void {
    this.playing = record;
    if (record) {
      this.labelMaterial.color.setHex(LABELS[record] ?? LABELS.sound!);
      this.record.visible = true;
    }
  }

  update(dt: number): void {
    const on = this.playing !== null;
    this.speed = approach(this.speed, on ? 1 : 0, dt / SPIN_UP_SECONDS);
    this.spinner.rotation.y -= SPIN * this.speed * dt;
    this.armAngle = approach(
      this.armAngle,
      on ? ARM_PLAYING : ARM_REST,
      (dt / ARM_SECONDS) * Math.abs(ARM_PLAYING - ARM_REST),
    );
    this.arm.rotation.y = this.armAngle;
    // Down onto the record once it's over it; up again to swing back.
    const over = (this.armAngle - ARM_REST) / (ARM_PLAYING - ARM_REST);
    const lowered = on ? Math.min(1, Math.max(0, (over - 0.9) * 10)) : 0;
    this.arm.position.y = ARM_HEIGHT - 0.006 * lowered;
    this.lamp.emissiveIntensity = approach(this.lamp.emissiveIntensity, on ? 2.2 : 0, dt * 4);
    // Taken off: the record goes once the platter has stopped.
    if (!on && this.speed === 0) this.record.visible = false;
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.disposables.forEach((item) => item.dispose());
  }

  private woodBox(w: number, h: number, d: number): THREE.BoxGeometry {
    return this.keep(woodBox(w, h, d));
  }

  private keep<T extends { dispose(): void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }
}

function approach(value: number, target: number, step: number): number {
  return value < target ? Math.min(target, value + step) : Math.max(target, value - step);
}

/** A record's face: fine rings of groove, a smooth run-out, catching light. */
function grooves(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  if (!g) return texture;
  g.fillStyle = '#121212';
  g.fillRect(0, 0, size, size);
  const middle = size / 2;
  for (let r = middle * 0.34; r < middle * 0.985; r += 1.6) {
    // Tracks: a slightly brighter band between songs.
    const between = Math.abs((((r / middle) * 7.3) % 1) - 0.5) < 0.02;
    const shade = between ? 58 : 30 + Math.random() * 16;
    g.strokeStyle = `rgb(${shade},${shade},${shade})`;
    g.lineWidth = 0.8;
    g.beginPath();
    g.arc(middle, middle, r, 0, Math.PI * 2);
    g.stroke();
  }
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
