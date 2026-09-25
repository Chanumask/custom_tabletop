import * as THREE from 'three';
import type { SoundState } from '@custom-tabletop/shared';
import { SOUNDBOARD_SLOT_COUNT, parseYouTubeUrl } from '@custom-tabletop/shared';
import { soundboardSlotOffset } from './soundboardLayout.js';

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

const PANEL_THICKNESS = 0.06;
// Tall enough for four rows of buttons *plus* a name label under each.
const PANEL_HEIGHT = 1.62;
/** The button grid sits a little above the panel's center, leaving room
 * for the bottom row's labels. */
const GRID_Y_SHIFT = 0.04;
const PANEL_WIDTH = 1.9;
const BUTTON_SIZE = 0.26;
const BUTTON_DEPTH = 0.06;
const EMPTY_COLOR = 0x3a3226;
// One distinct hue per slot (not per assigned sound) so a given button
// position keeps the same color whether or not it's currently filled —
// helps a player remember "top-left is the air horn" by spot, not by
// whatever happened to be uploaded first.
const FILLED_COLORS = Array.from({ length: SOUNDBOARD_SLOT_COUNT }, (_, i) =>
  new THREE.Color().setHSL(i / SOUNDBOARD_SLOT_COUNT, 0.55, 0.5).getHex(),
);

const LABEL_CANVAS_WIDTH = 1024;
const LABEL_FONT_PX = 24;
/** Space between a button's bottom edge and its label's center (metres). */
const LABEL_GAP = 0.045;
/** How wide a label may get before it's shortened with an ellipsis (metres)
 * — a little under the column spacing so neighbours never touch. */
const COL_LABEL_WIDTH = 0.38;

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

/** A small "SOUNDBOARD" plaque above the panel, so the board reads as what
 * it is from across the room. */
function createSign(): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#2b2018';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#c9a15a';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
    ctx.fillStyle = '#e9cf98';
    ctx.font = '700 46px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SOUNDBOARD', canvas.width / 2, canvas.height / 2 + 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.17),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.7 }),
  );
  sign.rotation.y = -Math.PI / 2;
  sign.position.set(-0.01, PANEL_HEIGHT / 2 + 0.16, 0);
  return sign;
}

/**
 * A wall-mounted 4x4 grid of physical buttons (Milestone 8 follow-up,
 * replacing the old floor-standing `SoundboardConsole`) — 16 fixed slots,
 * independent of however many sounds `GameState.soundboard` grows to.
 * Presentation only, same as its predecessor: no server logic lives here,
 * this just renders `GameState.soundboardSlots` and answers "which button is
 * the camera looking at" for `RoomView.tsx`'s E-to-interact handling
 * (aim-based, not proximity-based — a 4x4 grid on a flat wall can't be
 * disambiguated by XZ distance alone, since every button in a column sits at
 * the same X/Z and differs only in height).
 */
export class SoundboardWall {
  readonly group = new THREE.Group();
  private readonly buttons = new Map<THREE.Mesh, number>();
  private readonly buttonMeshes: THREE.Mesh[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private slots: (string | null)[] = [];
  private targeted: number | null = null;
  private readonly labelCanvas = document.createElement('canvas');
  private readonly labelTexture: THREE.CanvasTexture;

  constructor(scene: THREE.Scene, floorY: number) {
    this.group.name = 'soundboard-wall';

    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(PANEL_THICKNESS, PANEL_HEIGHT, PANEL_WIDTH),
      new THREE.MeshStandardMaterial({ color: 0x2b2018, roughness: 0.8 }),
    );
    this.group.add(panel);

    // Button labels: one canvas covering the panel's room-facing side,
    // redrawn on every sync (the sound names under each button).
    this.labelCanvas.width = LABEL_CANVAS_WIDTH;
    this.labelCanvas.height = Math.round(LABEL_CANVAS_WIDTH * (PANEL_HEIGHT / PANEL_WIDTH));
    this.labelTexture = new THREE.CanvasTexture(this.labelCanvas);
    this.labelTexture.colorSpace = THREE.SRGBColorSpace;
    this.labelTexture.anisotropy = 4;
    const labels = new THREE.Mesh(
      new THREE.PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT),
      new THREE.MeshStandardMaterial({
        map: this.labelTexture,
        transparent: true,
        roughness: 0.9,
      }),
    );
    // A plane faces +Z; turning it -90° about Y faces it into the room
    // (-X), with the canvas's left-to-right running along +Z — the
    // viewer's own left-to-right when facing this (east) wall.
    labels.rotation.y = -Math.PI / 2;
    labels.position.x = -(PANEL_THICKNESS / 2 + 0.002);
    this.group.add(labels);

    this.group.add(createSign());

    for (let index = 0; index < SOUNDBOARD_SLOT_COUNT; index += 1) {
      const offset = soundboardSlotOffset(index);
      if (!offset) {
        continue;
      }
      const button = new THREE.Mesh(
        new THREE.BoxGeometry(BUTTON_DEPTH, BUTTON_SIZE, BUTTON_SIZE),
        new THREE.MeshStandardMaterial({ color: EMPTY_COLOR, roughness: 0.4 }),
      );
      button.position.set(
        -(PANEL_THICKNESS / 2 + BUTTON_DEPTH / 2),
        offset.y + GRID_Y_SHIFT,
        offset.z,
      );
      this.group.add(button);
      this.buttons.set(button, index);
      this.buttonMeshes.push(button);
    }

    this.group.position.set(SOUNDBOARD_WALL_POSITION.x, floorY + 1.6, SOUNDBOARD_WALL_POSITION.z);
    scene.add(this.group);
  }

  /** Rebuilds each button's color from whether its slot is filled — never
   * rebuilds the meshes themselves (unlike the old console's per-sound
   * button list), since the 16 slots are fixed regardless of how many sounds
   * exist. */
  sync(soundboard: SoundState[], slots: (string | null)[]): void {
    this.slots = slots;
    const byId = new Map(soundboard.map((sound) => [sound.id, sound]));
    for (const button of this.buttonMeshes) {
      const index = this.buttons.get(button);
      if (index === undefined) {
        continue;
      }
      const soundId = slots[index];
      const filled = soundId !== null && soundId !== undefined && byId.has(soundId);
      const material = button.material as THREE.MeshStandardMaterial;
      material.color.setHex(filled ? FILLED_COLORS[index]! : EMPTY_COLOR);
    }
    this.applyHighlight();
    this.drawLabels((index) => {
      const soundId = slots[index];
      return soundId ? (byId.get(soundId) ?? null) : null;
    });
  }

  private drawLabels(soundAt: (index: number) => SoundState | null): void {
    const ctx = this.labelCanvas.getContext('2d');
    if (!ctx) {
      return;
    }
    const { width, height } = this.labelCanvas;
    const pxPerMetre = width / PANEL_WIDTH;
    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let index = 0; index < SOUNDBOARD_SLOT_COUNT; index += 1) {
      const offset = soundboardSlotOffset(index);
      if (!offset) {
        continue;
      }
      const sound = soundAt(index);
      const centerX = (offset.z + PANEL_WIDTH / 2) * pxPerMetre;
      const labelY = offset.y + GRID_Y_SHIFT - BUTTON_SIZE / 2 - LABEL_GAP;
      const centerY = (PANEL_HEIGHT / 2 - labelY) * pxPerMetre;
      const maxWidth = (COL_LABEL_WIDTH * pxPerMetre) | 0;

      if (sound) {
        const prefix = sound.url && parseYouTubeUrl(sound.url) ? '▶ ' : '';
        ctx.font = `600 ${LABEL_FONT_PX}px system-ui, sans-serif`;
        ctx.fillStyle = '#f3e6d3';
        ctx.fillText(fitText(ctx, prefix + sound.name, maxWidth), centerX, centerY);
      } else {
        ctx.font = `italic ${LABEL_FONT_PX - 4}px system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(243, 230, 211, 0.4)';
        ctx.fillText('+ empty', centerX, centerY);
      }
    }
    this.labelTexture.needsUpdate = true;
  }

  /** Lights up the button the player is aiming at (null: none), so it's
   * clear which one E will press before pressing it. */
  setTargeted(index: number | null): void {
    if (index === this.targeted) {
      return;
    }
    this.targeted = index;
    this.applyHighlight();
  }

  private applyHighlight(): void {
    for (const button of this.buttonMeshes) {
      const material = button.material as THREE.MeshStandardMaterial;
      if (this.buttons.get(button) === this.targeted) {
        // A glow in the button's own color, and it stands a little proud.
        material.emissive.copy(material.color).multiplyScalar(0.45);
        button.position.x = -(PANEL_THICKNESS / 2 + BUTTON_DEPTH / 2) - 0.012;
      } else {
        material.emissive.setHex(0x000000);
        button.position.x = -(PANEL_THICKNESS / 2 + BUTTON_DEPTH / 2);
      }
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
    const [hit] = this.raycaster.intersectObjects(this.buttonMeshes, false);
    if (!hit || !(hit.object instanceof THREE.Mesh)) {
      return null;
    }
    return this.buttons.get(hit.object) ?? null;
  }

  dispose(): void {
    for (const child of this.group.children) {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const material = child.material as THREE.MeshStandardMaterial;
        material.map?.dispose();
        material.dispose();
      }
    }
    this.buttons.clear();
    this.buttonMeshes.length = 0;
    this.group.parent?.remove(this.group);
  }
}
