import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { resolveMovement, type RoomBounds, type TableBounds } from './collision.js';
import { PLAYER_RADIUS } from './RoomLayout.js';

const MOVE_SPEED = 3; // metres/second, walking pace

const FORWARD_KEYS = new Set(['KeyW', 'ArrowUp']);
const BACK_KEYS = new Set(['KeyS', 'ArrowDown']);
const LEFT_KEYS = new Set(['KeyA', 'ArrowLeft']);
const RIGHT_KEYS = new Set(['KeyD', 'ArrowRight']);

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
export class FirstPersonController {
  readonly controls: PointerLockControls;
  private readonly room: RoomBounds;
  private readonly table: TableBounds;
  private readonly playerRadius: number;
  private readonly moveSpeed: number;
  private readonly pressedKeys = new Set<string>();

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
