import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { resolveMovement, type RoomBounds, type TableBounds } from './collision.js';
import { PLAYER_RADIUS } from './RoomLayout.js';

const MOVE_SPEED = 3; // metres/second, walking pace

const FORWARD_KEYS = new Set(['KeyW', 'ArrowUp']);
const BACK_KEYS = new Set(['KeyS', 'ArrowDown']);
const LEFT_KEYS = new Set(['KeyA', 'ArrowLeft']);
const RIGHT_KEYS = new Set(['KeyD', 'ArrowRight']);

/** Every `KeyboardEvent.code` this controller reads for movement — exported
 * so the interact-key rebind UI (Settings, Milestone 10) can refuse to bind
 * onto a movement key instead of silently breaking WASD. */
export const MOVEMENT_KEYS = new Set([...FORWARD_KEYS, ...BACK_KEYS, ...LEFT_KEYS, ...RIGHT_KEYS]);

export interface FirstPersonControllerOptions {
  camera: THREE.PerspectiveCamera;
  domElement: HTMLElement;
  room: RoomBounds;
  table: TableBounds;
  playerRadius?: number;
  moveSpeed?: number;
}

/**
 * Wraps Three.js's PointerLockControls for WASD + mouse-look movement, with
 * every position change gated through the pure `resolveMovement` collision
 * function rather than trusting PointerLockControls' own unbounded
 * moveForward/moveRight. PointerLockControls still does the camera-relative
 * direction math (it flattens pitch out of forward/right for us) — this
 * class captures the position delta it produces each frame and re-resolves
 * it against the room/table before committing it.
 */
/** How high above the table the camera hovers while "seated" (Milestone
 * 8's table interactable), looking straight down at it. Tuned so the table
 * (radius 1.1m) fills a *square* viewport (RoomView.tsx switches to one
 * while seated, at this same fixed 70° vertical FOV) with a small margin,
 * rather than floating in the middle of a mostly-empty square frame. */
const SEATED_HEIGHT_ABOVE_TABLE = 1.65;

export class FirstPersonController {
  readonly controls: PointerLockControls;
  private readonly room: RoomBounds;
  private readonly table: TableBounds;
  private readonly playerRadius: number;
  private readonly moveSpeed: number;
  private readonly pressedKeys = new Set<string>();
  private standingState: { position: THREE.Vector3; quaternion: THREE.Quaternion } | null = null;

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    this.pressedKeys.add(event.code);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.pressedKeys.delete(event.code);
  };

  constructor(options: FirstPersonControllerOptions) {
    this.controls = new PointerLockControls(options.camera, options.domElement);
    this.room = options.room;
    this.table = options.table;
    this.playerRadius = options.playerRadius ?? PLAYER_RADIUS;
    this.moveSpeed = options.moveSpeed ?? MOVE_SPEED;
  }

  connect(): void {
    document.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('keyup', this.handleKeyUp);
  }

  dispose(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('keyup', this.handleKeyUp);
    this.pressedKeys.clear();
    this.controls.unlock();
  }

  /** Advances the player by `deltaSeconds` of held-key input, resolved
   * against walls/table. No-op while pointer lock isn't active. */
  update(deltaSeconds: number): void {
    if (!this.controls.isLocked || deltaSeconds <= 0) {
      return;
    }

    let forwardAmount = 0;
    let rightAmount = 0;
    if (this.anyPressed(FORWARD_KEYS)) forwardAmount += 1;
    if (this.anyPressed(BACK_KEYS)) forwardAmount -= 1;
    if (this.anyPressed(RIGHT_KEYS)) rightAmount += 1;
    if (this.anyPressed(LEFT_KEYS)) rightAmount -= 1;

    if (forwardAmount === 0 && rightAmount === 0) {
      return;
    }

    // Normalize so diagonal (forward+strafe) movement isn't faster than
    // moving along a single axis.
    const inputLength = Math.hypot(forwardAmount, rightAmount) || 1;
    const step = (this.moveSpeed * deltaSeconds) / inputLength;

    const object = this.controls.object;
    const before = { x: object.position.x, z: object.position.z };

    // Let PointerLockControls do the camera-relative direction math, then
    // treat the position change it produced as the intended delta.
    this.controls.moveRight(rightAmount * step);
    this.controls.moveForward(forwardAmount * step);

    const after = { x: object.position.x, z: object.position.z };
    const delta = { x: after.x - before.x, z: after.z - before.z };

    const resolved = resolveMovement(before, delta, this.room, this.table, this.playerRadius);
    object.position.x = resolved.x;
    object.position.z = resolved.z;
  }

  /** "Sits" at the table (Milestone 8): releases pointer lock (so the
   * existing raycast-driven table interactions — drawing, dice, the
   * soundboard console — work immediately without a separate click) and
   * takes the camera over directly, hovering it above the table looking
   * straight down. `update()`'s movement already no-ops while unlocked, so
   * WASD is disabled for free as a side effect, without a separate seated
   * flag to check. A no-op if already seated. */
  sit(): void {
    if (this.standingState) {
      return;
    }
    const object = this.controls.object;
    this.standingState = {
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
    };
    this.controls.unlock();
    object.position.set(this.table.center.x, SEATED_HEIGHT_ABOVE_TABLE, this.table.center.z);
    object.lookAt(this.table.center.x, 0, this.table.center.z);
  }

  /** Restores the camera to wherever it was right before `sit()` — the
   * player doesn't auto-relock (matching every other unlocked state, which
   * always resumes via the "click to look around" overlay rather than a
   * silent programmatic relock some browsers don't even allow outside a
   * direct click gesture). A no-op if not currently seated. */
  stand(): void {
    if (!this.standingState) {
      return;
    }
    const object = this.controls.object;
    object.position.copy(this.standingState.position);
    object.quaternion.copy(this.standingState.quaternion);
    this.standingState = null;
  }

  get isSeated(): boolean {
    return this.standingState !== null;
  }

  /** Current facing direction (yaw only, radians) — derived from the
   * camera's world direction rather than read off `camera.rotation.y`,
   * which uses a different Euler order than PointerLockControls' internal
   * pitch/yaw tracking and isn't reliable to read directly. */
  getYaw(): number {
    const forward = new THREE.Vector3();
    this.controls.object.getWorldDirection(forward);
    return Math.atan2(forward.x, forward.z);
  }

  private anyPressed(codes: Set<string>): boolean {
    for (const code of this.pressedKeys) {
      if (codes.has(code)) {
        return true;
      }
    }
    return false;
  }
}
