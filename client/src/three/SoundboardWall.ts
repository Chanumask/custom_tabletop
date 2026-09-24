import * as THREE from 'three';
import type { SoundState } from '@custom-tabletop/shared';
import { SOUNDBOARD_SLOT_COUNT } from '@custom-tabletop/shared';
import { soundboardSlotOffset } from './soundboardLayout.js';

/** The room's east wall, the same back corner the old floor-standing
 * console used to occupy (SoundboardConsole.ts, replaced by this
 * wall-mounted board) — known clear of the bookshelf/lamp, which are on the
 * opposite (west) wall. Exact placement is eyeballed against the real
 * Blender room in a browser check, same approach as RoomLamp.ts. */
export const SOUNDBOARD_WALL_POSITION = { x: 4.9, z: -3.0 };
/** Raycast max distance for "aiming" at a button (SoundboardWall.raycastFromCamera)
 * — doubles as the proximity requirement, since a ray that far only resolves
 * to a hit if the player is standing close enough to the wall to begin with. */
export const SOUNDBOARD_RANGE = 2.4;

const PANEL_THICKNESS = 0.06;
const PANEL_HEIGHT = 1.5;
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

  constructor(scene: THREE.Scene, floorY: number) {
    this.group.name = 'soundboard-wall';

    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(PANEL_THICKNESS, PANEL_HEIGHT, PANEL_WIDTH),
      new THREE.MeshStandardMaterial({ color: 0x2b2018, roughness: 0.8 }),
    );
    this.group.add(panel);

    for (let index = 0; index < SOUNDBOARD_SLOT_COUNT; index += 1) {
      const offset = soundboardSlotOffset(index);
      if (!offset) {
        continue;
      }
      const button = new THREE.Mesh(
        new THREE.BoxGeometry(BUTTON_DEPTH, BUTTON_SIZE, BUTTON_SIZE),
        new THREE.MeshStandardMaterial({ color: EMPTY_COLOR, roughness: 0.4 }),
      );
      button.position.set(-(PANEL_THICKNESS / 2 + BUTTON_DEPTH / 2), offset.y, offset.z);
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
    const knownSoundIds = new Set(soundboard.map((sound) => sound.id));
    for (const button of this.buttonMeshes) {
      const index = this.buttons.get(button);
      if (index === undefined) {
        continue;
      }
      const soundId = slots[index];
      const filled = soundId !== null && soundId !== undefined && knownSoundIds.has(soundId);
      const material = button.material as THREE.MeshStandardMaterial;
      material.color.setHex(filled ? FILLED_COLORS[index]! : EMPTY_COLOR);
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
        (child.material as THREE.Material).dispose();
      }
    }
    this.buttons.clear();
    this.buttonMeshes.length = 0;
    this.group.parent?.remove(this.group);
  }
}
