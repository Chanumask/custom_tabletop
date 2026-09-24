import * as THREE from 'three';
import type { SoundState } from '@custom-tabletop/shared';

/** The room's other free corner, opposite the lamp (RoomLamp.ts) —
 * eyeballed against the real Blender room the same way. */
export const SOUNDBOARD_POSITION = { x: 4.3, z: -3.2 };
export const SOUNDBOARD_RANGE = 1.8;

// However many sounds the shared soundboard grows to (built-ins plus
// uploads), the physical console only has so many buttons — the rest stay
// reachable through the 2D panel (SessionView.tsx), same underlying
// sound:play event either way.
const MAX_BUTTONS = 6;
const BUTTON_COLORS = [0xd94f4f, 0xe0a53a, 0xd9c23a, 0x4fa36a, 0x4f7fd9, 0x8a4fd9];
// "Large buttons" per the user's own ask — sized to still be comfortably
// clickable from across the room, not just up close.
const BUTTON_RADIUS = 0.16;
const BUTTON_HEIGHT = 0.05;
const BUTTONS_PER_ROW = 3;
const BUTTON_SPACING_X = 0.4;
const BUTTON_SPACING_Z = 0.36;
const CONSOLE_TOP_Y = 0.55;

/**
 * A physical, clickable "jukebox" console standing in the room — a fun,
 * literal soundboard, reusing `sound:play`'s existing authority/sync
 * entirely (this class is presentation only; no new server logic). Buttons
 * are raycast-clickable while the pointer isn't locked, the same "mouse is
 * free to interact with something in the room" gating `TableDrawing`
 * already uses for the table surface. Rebuilds its buttons from
 * `GameState.soundboard` on every change, the same full-snapshot `sync`
 * pattern `DiceManager` uses (Milestone 6).
 */
export class SoundboardConsole {
  readonly group = new THREE.Group();
  private readonly buttons = new Map<THREE.Mesh, string>();
  private readonly raycaster = new THREE.Raycaster();

  constructor(scene: THREE.Scene, floorY: number) {
    this.group.name = 'soundboard-console';

    const cabinet = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, CONSOLE_TOP_Y, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x2b2018, roughness: 0.7 }),
    );
    cabinet.position.y = CONSOLE_TOP_Y / 2;
    this.group.add(cabinet);

    this.group.position.set(SOUNDBOARD_POSITION.x, floorY, SOUNDBOARD_POSITION.z);
    scene.add(this.group);
  }

  sync(soundboard: SoundState[]): void {
    for (const mesh of this.buttons.keys()) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.buttons.clear();

    soundboard.slice(0, MAX_BUTTONS).forEach((sound, index) => {
      const row = Math.floor(index / BUTTONS_PER_ROW);
      const col = index % BUTTONS_PER_ROW;

      const button = new THREE.Mesh(
        new THREE.CylinderGeometry(BUTTON_RADIUS, BUTTON_RADIUS, BUTTON_HEIGHT, 20),
        new THREE.MeshStandardMaterial({
          color: BUTTON_COLORS[index % BUTTON_COLORS.length],
          roughness: 0.4,
        }),
      );
      button.position.set(
        (col - 1) * BUTTON_SPACING_X,
        CONSOLE_TOP_Y + BUTTON_HEIGHT / 2,
        (row - 0.5) * BUTTON_SPACING_Z,
      );
      this.group.add(button);
      this.buttons.set(button, sound.id);
    });
  }

  /** Raycasts a normalized-device-coordinate pointer against the console's
   * buttons, returning the clicked sound's id, or null for a miss. */
  raycastButton(camera: THREE.Camera, ndc: THREE.Vector2): string | null {
    this.raycaster.setFromCamera(ndc, camera);
    const [hit] = this.raycaster.intersectObjects([...this.buttons.keys()], false);
    if (!hit || !(hit.object instanceof THREE.Mesh)) {
      return null;
    }
    return this.buttons.get(hit.object) ?? null;
  }

  dispose(): void {
    for (const mesh of this.buttons.keys()) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.buttons.clear();
    for (const child of this.group.children) {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
    this.group.parent?.remove(this.group);
  }
}
