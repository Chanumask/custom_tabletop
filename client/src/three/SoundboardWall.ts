import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { SoundState } from '@custom-tabletop/shared';
import { SOUNDBOARD_SLOT_COUNT, parseYouTubeUrl } from '@custom-tabletop/shared';
import { SOUNDBOARD_JEWELS, soundboardSlotOffset } from './soundboardLayout.js';
import { seededRandom } from './parchment.js';

/** The room's east wall, the same back corner the old floor-standing
 * console used to occupy (SoundboardConsole.ts, replaced by this
 * wall-mounted board) — known clear of the bookshelf/lamp, which are on the
 * opposite (west) wall. Exact placement is eyeballed against the real
 * Blender room in a browser check, same approach as RoomLamp.ts. */
export const SOUNDBOARD_WALL_POSITION = { x: 4.93, z: -3.0 };
/** Raycast max distance for "aiming" at a button (SoundboardWall.raycastFromCamera)
 * — doubles as the proximity requirement, since a ray that far only resolves
 * to a hit if the player is standing close enough to the wall to begin with. */
export const SOUNDBOARD_RANGE = 2.4;

// The cabinet, in metres. Local axes: -X points into the room, Y up, +Z
// along the wall (a viewer's left-to-right when facing it).
const PANEL_THICKNESS = 0.06;
// Tall enough for four rows of buttons *plus* a nameplate under each.
const PANEL_HEIGHT = 1.62;
const PANEL_WIDTH = 1.9;
/** The moulded walnut frame around the leather field. */
const FRAME_WIDTH = 0.075;
const FRAME_DEPTH = 0.05;
const FIELD_WIDTH = PANEL_WIDTH - 2 * FRAME_WIDTH;
const FIELD_HEIGHT = PANEL_HEIGHT - 2 * FRAME_WIDTH;
/** The leather field's face (x). */
const FIELD_X = -(PANEL_THICKNESS / 2 + 0.001);
/** The button grid sits a little above the field's center, leaving room
 * for the bottom row's nameplates. */
const GRID_Y_SHIFT = 0.04;

// A button: a brass backplate, a brass bezel ring and an enamel dome cap.
const PLATE_RADIUS = 0.1;
const PLATE_DEPTH = 0.008;
const RING_RADIUS = 0.07;
const RING_TUBE = 0.012;
const CAP_RADIUS = 0.082;
/** How far down from its pole the dome cap reaches (radians). */
const CAP_SWEEP = 0.9;
/** A pressed button sinks this far; an aimed-at one stands this proud. */
const PRESS_DEPTH = 0.012;
const AIM_LIFT = 0.008;
const PULSE_SECONDS = 0.7;

const JEWELS = SOUNDBOARD_JEWELS;
const EMPTY_CAP = 0x2a2019;
const BRASS = 0xb8904a;
const WALNUT = '#3b2415';
const LEATHER = '#4a1d18';

const FIELD_CANVAS_WIDTH = 1024;
const PX_PER_METRE = FIELD_CANVAS_WIDTH / FIELD_WIDTH;
/** A nameplate under each button (metres). */
const PLATE_LABEL_WIDTH = 0.34;
const PLATE_LABEL_HEIGHT = 0.062;
/** Space between a button's center and its nameplate's center (metres). */
const LABEL_DROP = 0.162;

/** `text`, shortened with an ellipsis until it fits `maxWidth` pixels. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  let fitted = text;
  while (fitted.length > 1 && ctx.measureText(`${fitted}…`).width > maxWidth) {
    fitted = fitted.slice(0, -1);
  }
  return `${fitted.trimEnd()}…`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

/** A brushed-brass fill across a rect (a vertical sheen). */
function brassGradient(ctx: CanvasRenderingContext2D, y: number, height: number, dim = 1) {
  const gradient = ctx.createLinearGradient(0, y, 0, y + height);
  const shade = (r: number, g: number, b: number) =>
    `rgb(${Math.round(r * dim)}, ${Math.round(g * dim)}, ${Math.round(b * dim)})`;
  gradient.addColorStop(0, shade(236, 206, 138));
  gradient.addColorStop(0.45, shade(201, 158, 82));
  gradient.addColorStop(1, shade(150, 108, 48));
  return gradient;
}

/** Engraved lettering: dark cut, with a thin light lip below it. */
function engrave(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, dim = 1) {
  ctx.fillStyle = `rgba(255, 238, 190, ${0.55 * dim})`;
  ctx.fillText(text, x, y + 1.5);
  ctx.fillStyle = `rgba(52, 30, 10, ${0.92 * dim})`;
  ctx.fillText(text, x, y);
}

/** Straight-grained dark walnut, seeded so every player sees the same wood. */
function walnutCanvas(width: number, height: number, seed: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const random = seededRandom(seed);
  ctx.fillStyle = WALNUT;
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < width * 0.9; i += 1) {
    const y = random() * height;
    const light = random() < 0.35;
    ctx.strokeStyle = light
      ? `rgba(120, 76, 44, ${0.08 + random() * 0.14})`
      : `rgba(18, 9, 4, ${0.1 + random() * 0.2})`;
    ctx.lineWidth = 0.6 + random() * 1.8;
    ctx.beginPath();
    ctx.moveTo(0, y);
    let drift = y;
    for (let x = 0; x <= width; x += width / 8) {
      drift += (random() - 0.5) * 3;
      ctx.lineTo(x, drift);
    }
    ctx.stroke();
  }
  return canvas;
}

/** The field's leather, stitching and the lamp's pool of light — painted
 * once; the nameplates go over it on every sync. */
function leatherCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const random = seededRandom(0x5eed);
  ctx.fillStyle = LEATHER;
  ctx.fillRect(0, 0, width, height);
  // Pebbled grain.
  for (let i = 0; i < 9000; i += 1) {
    const dark = random() < 0.55;
    ctx.fillStyle = dark
      ? `rgba(20, 6, 4, ${0.12 + random() * 0.18})`
      : `rgba(150, 70, 55, ${0.05 + random() * 0.08})`;
    const size = 1 + random() * 2.4;
    ctx.fillRect(random() * width, random() * height, size, size);
  }
  // The picture lamp above the board pools warm light on its top half.
  const pool = ctx.createRadialGradient(width / 2, -height * 0.25, 0, width / 2, 0, height * 1.05);
  pool.addColorStop(0, 'rgba(255, 196, 120, 0.34)');
  pool.addColorStop(0.55, 'rgba(255, 170, 90, 0.1)');
  pool.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, width, height);
  // Worn darker toward the edges.
  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    height * 0.35,
    width / 2,
    height / 2,
    width * 0.72,
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  // Saddle stitching just inside the frame.
  const inset = 14;
  ctx.setLineDash([9, 7]);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = 'rgba(205, 160, 105, 0.55)';
  ctx.strokeRect(inset, inset, width - 2 * inset, height - 2 * inset);
  ctx.setLineDash([]);
  return canvas;
}

/** The engraved brass plaque on the top rail: a brass slab, its engraved
 * face a plane just in front. */
function createSign(
  brass: THREE.Material,
  keep: <T extends { dispose(): void }>(item: T) => T,
): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = brassGradient(ctx, 0, canvas.height);
    roundRect(ctx, 0, 0, canvas.width, canvas.height, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90, 58, 20, 0.8)';
    ctx.lineWidth = 3;
    roundRect(ctx, 12, 12, canvas.width - 24, canvas.height - 24, 10);
    ctx.stroke();
    // Two screws.
    for (const x of [34, canvas.width - 34]) {
      ctx.fillStyle = 'rgba(110, 74, 28, 0.9)';
      ctx.beginPath();
      ctx.arc(x, canvas.height / 2, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 236, 180, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 6, canvas.height / 2 - 3);
      ctx.lineTo(x + 6, canvas.height / 2 + 3);
      ctx.stroke();
    }
    ctx.font = '700 56px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    engrave(ctx, 'S O U N D B O A R D', canvas.width / 2, canvas.height / 2 + 3);
  }
  const texture = keep(new THREE.CanvasTexture(canvas));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const sign = new THREE.Mesh(keep(new RoundedBoxGeometry(0.012, 0.13, 0.65, 2, 0.004)), brass);
  const face = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(0.64, 0.122)),
    keep(new THREE.MeshStandardMaterial({ map: texture, metalness: 0.35, roughness: 0.38 })),
  );
  face.rotation.y = -Math.PI / 2;
  face.position.x = -0.0062;
  sign.add(face);
  sign.position.set(-(PANEL_THICKNESS / 2 + FRAME_DEPTH - 0.012), PANEL_HEIGHT / 2 + 0.02, 0);
  return sign;
}

interface Button {
  index: number;
  group: THREE.Group;
  cap: THREE.Mesh;
  capMaterial: THREE.MeshPhysicalMaterial;
  ringMaterial: THREE.MeshStandardMaterial;
  filled: boolean;
  /** Seconds left of a "played" pulse. */
  pulse: number;
}

/**
 * A wall-mounted 4x4 board of physical buttons (Milestone 8 follow-up,
 * replacing the old floor-standing `SoundboardConsole`) — 16 fixed slots,
 * independent of however many sounds `GameState.soundboard` grows to.
 * Dressed to belong in the room (docs/decisions.md, "The soundboard's
 * look"): a walnut cabinet with an oxblood leather field, brass-bezelled
 * enamel buttons in jewel tones, engraved nameplates and a picture lamp.
 * Presentation only: no server logic lives here, this renders
 * `GameState.soundboardSlots` and answers "which button is the camera
 * looking at" for `RoomView.tsx`'s E-to-interact handling (aim-based — a
 * 4x4 grid on a flat wall can't be told apart by XZ distance alone).
 */
export class SoundboardWall {
  readonly group = new THREE.Group();
  private readonly buttons: Button[] = [];
  private readonly buttonByMesh = new Map<THREE.Object3D, Button>();
  private readonly hitMeshes: THREE.Mesh[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly disposables: { dispose(): void }[] = [];
  private slots: (string | null)[] = [];
  private targeted: number | null = null;
  private readonly fieldCanvas = document.createElement('canvas');
  private readonly leather: HTMLCanvasElement;
  private readonly fieldTexture: THREE.CanvasTexture;

  /** `envMap`: reflections for the brass (the room has no environment of
   * its own); without it the brass is matte instead of near-black. */
  constructor(scene: THREE.Scene, floorY: number, envMap: THREE.Texture | null = null) {
    this.group.name = 'soundboard-wall';

    const keep = <T extends { dispose(): void }>(item: T): T => this.keep(item);
    const brass = (roughness = 0.34) =>
      keep(
        new THREE.MeshStandardMaterial({
          color: BRASS,
          metalness: envMap ? 0.92 : 0.45,
          roughness,
          envMap,
          envMapIntensity: 0.55,
        }),
      );

    // The cabinet: a walnut back, a moulded frame, a leather field.
    const walnut = keep(new THREE.CanvasTexture(walnutCanvas(256, 512, 0xa1)));
    walnut.colorSpace = THREE.SRGBColorSpace;
    walnut.wrapS = walnut.wrapT = THREE.RepeatWrapping;
    const woodMaterial = keep(
      new THREE.MeshStandardMaterial({ map: walnut, roughness: 0.55, color: 0xffffff }),
    );
    const back = new THREE.Mesh(
      keep(new THREE.BoxGeometry(PANEL_THICKNESS, PANEL_HEIGHT, PANEL_WIDTH)),
      woodMaterial,
    );
    this.group.add(back);

    const railX = -(PANEL_THICKNESS / 2 + FRAME_DEPTH / 2 - 0.02);
    const rail = (height: number, width: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(
        keep(new RoundedBoxGeometry(FRAME_DEPTH, height, width, 3, 0.012)),
        woodMaterial,
      );
      mesh.position.set(railX, y, z);
      this.group.add(mesh);
    };
    rail(FRAME_WIDTH, PANEL_WIDTH, PANEL_HEIGHT / 2 - FRAME_WIDTH / 2, 0);
    rail(FRAME_WIDTH, PANEL_WIDTH, -PANEL_HEIGHT / 2 + FRAME_WIDTH / 2, 0);
    rail(FIELD_HEIGHT, FRAME_WIDTH, 0, PANEL_WIDTH / 2 - FRAME_WIDTH / 2);
    rail(FIELD_HEIGHT, FRAME_WIDTH, 0, -PANEL_WIDTH / 2 + FRAME_WIDTH / 2);
    // Brass corner caps.
    const cornerGeometry = keep(new THREE.SphereGeometry(0.018, 16, 12));
    const cornerMaterial = brass(0.3);
    for (const y of [1, -1]) {
      for (const z of [1, -1]) {
        const corner = new THREE.Mesh(cornerGeometry, cornerMaterial);
        corner.scale.x = 0.55;
        corner.position.set(
          railX - FRAME_DEPTH / 2,
          y * (PANEL_HEIGHT / 2 - FRAME_WIDTH / 2),
          z * (PANEL_WIDTH / 2 - FRAME_WIDTH / 2),
        );
        this.group.add(corner);
      }
    }

    // The leather field, repainted with the nameplates on every sync.
    this.leather = leatherCanvas(
      FIELD_CANVAS_WIDTH,
      Math.round(FIELD_CANVAS_WIDTH * (FIELD_HEIGHT / FIELD_WIDTH)),
    );
    this.fieldCanvas.width = this.leather.width;
    this.fieldCanvas.height = this.leather.height;
    this.fieldTexture = keep(new THREE.CanvasTexture(this.fieldCanvas));
    this.fieldTexture.colorSpace = THREE.SRGBColorSpace;
    this.fieldTexture.anisotropy = 4;
    const field = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(FIELD_WIDTH, FIELD_HEIGHT)),
      keep(new THREE.MeshStandardMaterial({ map: this.fieldTexture, roughness: 0.78 })),
    );
    // A plane faces +Z; turning it -90° about Y faces it into the room (-X),
    // with the canvas's left-to-right running along +Z.
    field.rotation.y = -Math.PI / 2;
    field.position.x = FIELD_X;
    this.group.add(field);

    this.group.add(createSign(brass(0.3), keep));
    this.addLamp(brass);

    // The buttons.
    const plateGeometry = keep(
      new THREE.CylinderGeometry(PLATE_RADIUS, PLATE_RADIUS, PLATE_DEPTH, 40),
    );
    const ringGeometry = keep(new THREE.TorusGeometry(RING_RADIUS, RING_TUBE, 14, 44));
    const capGeometry = keep(
      new THREE.SphereGeometry(CAP_RADIUS, 36, 14, 0, Math.PI * 2, 0, CAP_SWEEP),
    );
    const plateMaterial = brass(0.42);
    for (let index = 0; index < SOUNDBOARD_SLOT_COUNT; index += 1) {
      const offset = soundboardSlotOffset(index);
      if (!offset) continue;
      const group = new THREE.Group();
      group.position.set(0, offset.y + GRID_Y_SHIFT, offset.z);

      const plate = new THREE.Mesh(plateGeometry, plateMaterial);
      plate.rotation.z = Math.PI / 2; // a cylinder's axis is Y; face it into the room
      plate.position.x = FIELD_X - PLATE_DEPTH / 2;
      const plateFront = FIELD_X - PLATE_DEPTH;

      const ringMaterial = brass(0.26);
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.y = Math.PI / 2; // a torus lies in XY; stand it on the wall
      ring.position.x = plateFront - RING_TUBE / 2;

      const capMaterial = keep(
        new THREE.MeshPhysicalMaterial({
          color: EMPTY_CAP,
          roughness: 0.28,
          clearcoat: 1,
          clearcoatRoughness: 0.12,
          envMap,
          envMapIntensity: 0.5,
        }),
      );
      const cap = new THREE.Mesh(capGeometry, capMaterial);
      cap.rotation.z = Math.PI / 2; // the dome's pole (+Y) points into the room (-X)
      // Its rim sits on the backplate, inside the bezel.
      cap.position.x = plateFront + CAP_RADIUS * Math.cos(CAP_SWEEP);

      group.add(plate, ring, cap);
      this.group.add(group);
      const button: Button = {
        index,
        group,
        cap,
        capMaterial,
        ringMaterial,
        filled: false,
        pulse: 0,
      };
      this.buttons.push(button);
      for (const mesh of [plate, ring, cap]) {
        this.buttonByMesh.set(mesh, button);
        this.hitMeshes.push(mesh);
      }
    }

    this.group.position.set(SOUNDBOARD_WALL_POSITION.x, floorY + 1.6, SOUNDBOARD_WALL_POSITION.z);
    scene.add(this.group);
  }

  /** A small brass picture lamp over the board: a hood whose underside
   * glows, and a soft halo. Its light on the board is painted into the
   * leather (the room has lights enough already). */
  private addLamp(brass: (roughness?: number) => THREE.MeshStandardMaterial): void {
    const lampY = PANEL_HEIGHT / 2 + 0.15;
    // Two arms from wall mounts out to the tube's ends.
    const armMaterial = brass(0.3);
    const armGeometry = this.keep(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 10));
    const mountGeometry = this.keep(new THREE.CylinderGeometry(0.026, 0.026, 0.012, 20));
    const parts: THREE.Object3D[] = [];
    for (const z of [-0.2, 0.2]) {
      const arm = new THREE.Mesh(armGeometry, armMaterial);
      arm.rotation.z = Math.PI / 2;
      arm.position.set(-0.1, lampY + 0.012, z);
      const mount = new THREE.Mesh(mountGeometry, armMaterial);
      mount.rotation.z = Math.PI / 2;
      mount.position.set(-0.006, lampY + 0.012, z);
      parts.push(arm, mount);
    }
    // A brass tube along the wall with a glowing slot underneath.
    const hood = new THREE.Mesh(
      this.keep(new THREE.CylinderGeometry(0.034, 0.034, 0.56, 24)),
      brass(0.28),
    );
    hood.rotation.x = Math.PI / 2;
    hood.position.set(-0.2, lampY, 0);
    const bulb = new THREE.Mesh(
      this.keep(new THREE.BoxGeometry(0.03, 0.01, 0.5)),
      this.keep(new THREE.MeshBasicMaterial({ color: 0xffe2a8, toneMapped: false })),
    );
    bulb.position.set(-0.2, lampY - 0.031, 0);
    const halo = this.lampHalo();
    halo.position.set(-0.22, lampY - 0.05, 0);
    this.group.add(...parts, hood, bulb, halo);
  }

  private lampHalo(): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(255, 214, 150, 0.9)');
      gradient.addColorStop(0.35, 'rgba(255, 180, 100, 0.25)');
      gradient.addColorStop(1, 'rgba(255, 160, 80, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);
    }
    const texture = this.keep(new THREE.CanvasTexture(canvas));
    const sprite = new THREE.Sprite(
      this.keep(
        new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      ),
    );
    sprite.scale.set(0.9, 0.3, 1);
    return sprite;
  }

  private keep<T extends { dispose(): void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  /** Colors each button from whether its slot is filled, and repaints the
   * nameplates — never rebuilds the meshes (the 16 slots are fixed). */
  sync(soundboard: SoundState[], slots: (string | null)[]): void {
    this.slots = slots;
    const byId = new Map(soundboard.map((sound) => [sound.id, sound]));
    for (const button of this.buttons) {
      const soundId = slots[button.index];
      button.filled = soundId !== null && soundId !== undefined && byId.has(soundId);
      button.capMaterial.color.setHex(button.filled ? JEWELS[button.index]! : EMPTY_CAP);
    }
    this.applyLook();
    this.drawField((index) => {
      const soundId = slots[index];
      return soundId ? (byId.get(soundId) ?? null) : null;
    });
  }

  private drawField(soundAt: (index: number) => SoundState | null): void {
    const ctx = this.fieldCanvas.getContext('2d');
    if (!ctx) {
      return;
    }
    const { height } = this.fieldCanvas;
    ctx.drawImage(this.leather, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const plateWidth = PLATE_LABEL_WIDTH * PX_PER_METRE;
    const plateHeight = PLATE_LABEL_HEIGHT * PX_PER_METRE;

    for (let index = 0; index < SOUNDBOARD_SLOT_COUNT; index += 1) {
      const offset = soundboardSlotOffset(index);
      if (!offset) continue;
      const sound = soundAt(index);
      const centerX = (offset.z + FIELD_WIDTH / 2) * PX_PER_METRE;
      const labelY = offset.y + GRID_Y_SHIFT - LABEL_DROP;
      const centerY = height / 2 - labelY * PX_PER_METRE;
      const x = centerX - plateWidth / 2;
      const y = centerY - plateHeight / 2;
      const dim = sound ? 1 : 0.62;

      // The plate, a shadow under it, and two pins.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      roundRect(ctx, x + 2, y + 3, plateWidth, plateHeight, 5);
      ctx.fill();
      ctx.fillStyle = brassGradient(ctx, y, plateHeight, dim);
      roundRect(ctx, x, y, plateWidth, plateHeight, 5);
      ctx.fill();
      ctx.strokeStyle = `rgba(80, 50, 16, ${0.7 * dim})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = `rgba(100, 66, 24, ${dim})`;
      for (const pinX of [x + 7, x + plateWidth - 7]) {
        ctx.beginPath();
        ctx.arc(pinX, centerY, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }

      if (sound) {
        const prefix = sound.url && parseYouTubeUrl(sound.url) ? '▶ ' : '';
        ctx.font = '700 26px Georgia, "Times New Roman", serif';
        engrave(ctx, fitText(ctx, prefix + sound.name, plateWidth - 26), centerX, centerY + 1);
      } else {
        ctx.font = 'italic 21px Georgia, "Times New Roman", serif';
        engrave(ctx, 'empty', centerX, centerY + 1, 0.75);
      }
    }
    this.fieldTexture.needsUpdate = true;
  }

  /** Lights up the button the player is aiming at (null: none), so it's
   * clear which one E will press before pressing it. */
  setTargeted(index: number | null): void {
    if (index === this.targeted) {
      return;
    }
    this.targeted = index;
    this.applyLook();
  }

  /** A button whose sound just played (anyone's press) sinks in and flashes. */
  pulse(soundId: string): void {
    for (const button of this.buttons) {
      if (this.slots[button.index] === soundId) {
        button.pulse = PULSE_SECONDS;
      }
    }
  }

  /** Animates pulses; call once per frame. */
  update(delta: number): void {
    let changed = false;
    for (const button of this.buttons) {
      if (button.pulse > 0) {
        button.pulse = Math.max(0, button.pulse - delta);
        changed = true;
      }
    }
    if (changed) this.applyLook();
  }

  /** Each button's glow and depth: a filled one glows softly in its own
   * color, the aimed-at one brighter and a little proud, a pulsing one sinks
   * and flares. */
  private applyLook(): void {
    for (const button of this.buttons) {
      const aimed = button.index === this.targeted;
      const pulse = button.pulse / PULSE_SECONDS; // 1 → 0
      const glow = (button.filled ? 0.22 : 0) + (aimed ? 0.45 : 0) + pulse * 0.9;
      button.capMaterial.emissive
        .setHex(button.filled ? JEWELS[button.index]! : 0x6a5a48)
        .multiplyScalar(glow);
      button.ringMaterial.emissive.setHex(aimed ? 0x5a4020 : 0x000000);
      // Sink fast, spring back.
      const press = pulse > 0 ? Math.sin(Math.min(1, (1 - pulse) * 3) * Math.PI) * PRESS_DEPTH : 0;
      button.group.position.x = (aimed ? -AIM_LIFT : 0) + press;
    }
  }

  getSlotSoundId(index: number): string | null {
    return this.slots[index] ?? null;
  }

  /** Casts a ray from the camera's own position/direction (not the mouse —
   * this is "look at + press E", not "click"), bounded to `SOUNDBOARD_RANGE`
   * so a stray aim from across the room can't hit a button from way too far
   * away. Returns the targeted slot's index, or null for no hit. */
  raycastFromCamera(camera: THREE.Camera): number | null {
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const direction = camera.getWorldDirection(new THREE.Vector3());
    this.raycaster.set(origin, direction);
    this.raycaster.far = SOUNDBOARD_RANGE;
    const [hit] = this.raycaster.intersectObjects(this.hitMeshes, false);
    if (!hit) {
      return null;
    }
    return this.buttonByMesh.get(hit.object)?.index ?? null;
  }

  dispose(): void {
    this.disposables.forEach((item) => item.dispose());
    this.disposables.length = 0;
    this.buttons.length = 0;
    this.buttonByMesh.clear();
    this.hitMeshes.length = 0;
    this.group.parent?.remove(this.group);
  }
}
