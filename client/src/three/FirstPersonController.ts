import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { resolveMovement, type Obstacle, type RoomBounds } from './collision.js';
import { PLAYER_RADIUS, seatedCameraHeight, type TableSurface } from './RoomLayout.js';
import { isTypingTarget } from '../keyboard.js';

/** Metres/second. Walking is the default; holding Shift runs — so other
 * players see a matching walk or run animation (avatarMotion.ts). */
const WALK_SPEED = 2.2;
const RUN_SPEED = 4.2;

const FORWARD_KEYS = new Set(['KeyW', 'ArrowUp']);
const BACK_KEYS = new Set(['KeyS', 'ArrowDown']);
const LEFT_KEYS = new Set(['KeyA', 'ArrowLeft']);
const RIGHT_KEYS = new Set(['KeyD', 'ArrowRight']);

/** Every `KeyboardEvent.code` this controller reads for movement — exported
 * so the interact-key rebind UI (Settings, Milestone 10) can refuse to bind
 * onto a movement key instead of silently breaking WASD. */
export const MOVEMENT_KEYS = new Set([...FORWARD_KEYS, ...BACK_KEYS, ...LEFT_KEYS, ...RIGHT_KEYS]);
/** Held to run instead of walk. */
export const RUN_KEYS = new Set(['ShiftLeft', 'ShiftRight']);

/** Eye height of a seated character (standing eyes are at 1.7 m; the
 * sitting pose drops the head about half a metre — PlayerAvatars). */
export const SEATED_EYE_HEIGHT = 1.22;
/** Eyes sit a little forward of the chair's center, over the knees. */
const SEATED_EYE_FORWARD = 0.1;

/** A chair to sit on: where it stands and which way it faces (yaw 0 faces
 * +Z, like `Player.rotationY`). */
export interface ChairPose {
  x: number;
  z: number;
  yaw: number;
}

/** Seated, you either look out from your chair (free mouse-look: the other
 * players, the room) or straight down at the table as a map. */
export type SeatedView = 'chair' | 'table';

export interface FirstPersonControllerOptions {
  camera: THREE.PerspectiveCamera;
  domElement: HTMLElement;
  room: RoomBounds;
  /** Solid furniture footprints (from the room model's COL_* boxes). */
  obstacles: Obstacle[];
  /** The play surface — where sitting down looks. */
  table: TableSurface;
  playerRadius?: number;
  walkSpeed?: number;
  runSpeed?: number;
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
  private readonly obstacles: Obstacle[];
  private readonly table: TableSurface;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly playerRadius: number;
  private readonly walkSpeed: number;
  private readonly runSpeed: number;
  private readonly pressedKeys = new Set<string>();
  private standingState: { position: THREE.Vector3; quaternion: THREE.Quaternion } | null = null;
  private chair: ChairPose | null = null;
  private view: SeatedView = 'table';

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (isTypingTarget(event.target)) {
      return; // typing "w" into a text field must not queue up a walk
    }
    this.pressedKeys.add(event.code);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.pressedKeys.delete(event.code);
  };

  // A key held while focus leaves the page (alt-tab, clicking into another
  // window) never gets its keyup here, which would otherwise leave the
  // player walking on their own after they come back. Same on releasing
  // pointer lock: whatever was held stops counting.
  private readonly releaseAllKeys = (): void => {
    this.pressedKeys.clear();
  };

  constructor(options: FirstPersonControllerOptions) {
    this.controls = new PointerLockControls(options.camera, options.domElement);
    this.room = options.room;
    this.obstacles = options.obstacles;
    this.table = options.table;
    this.camera = options.camera;
    this.playerRadius = options.playerRadius ?? PLAYER_RADIUS;
    this.walkSpeed = options.walkSpeed ?? WALK_SPEED;
    this.runSpeed = options.runSpeed ?? RUN_SPEED;
  }

  connect(): void {
    document.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.releaseAllKeys);
    this.controls.addEventListener('unlock', this.releaseAllKeys);
  }

  dispose(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.releaseAllKeys);
    this.controls.removeEventListener('unlock', this.releaseAllKeys);
    this.pressedKeys.clear();
    this.controls.unlock();
  }

  /** Advances the player by `deltaSeconds` of held-key input, resolved
   * against walls/table. No-op while pointer lock isn't active. */
  update(deltaSeconds: number): void {
    // Seated, mouse-look still works (from the chair) but WASD doesn't.
    if (!this.controls.isLocked || this.isSeated || deltaSeconds <= 0) {
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
    const speed = this.anyPressed(RUN_KEYS) ? this.runSpeed : this.walkSpeed;
    const step = (speed * deltaSeconds) / inputLength;

    const object = this.controls.object;
    const before = { x: object.position.x, z: object.position.z };

    // Let PointerLockControls do the camera-relative direction math, then
    // treat the position change it produced as the intended delta.
    this.controls.moveRight(rightAmount * step);
    this.controls.moveForward(forwardAmount * step);

    const after = { x: object.position.x, z: object.position.z };
    const delta = { x: after.x - before.x, z: after.z - before.z };

    const resolved = resolveMovement(before, delta, this.room, this.obstacles, this.playerRadius);
    object.position.x = resolved.x;
    object.position.z = resolved.z;
  }

  /** Sits down at the table (Milestone 8, reworked): on `chair` when there
   * is one — looking out from it, where mouse-look still works and the
   * other players are right there — or straight down at the table as a map
   * (`view`, switchable any time with `setSeatedView`). Remembers the
   * standing pose so `stand()` puts the player back exactly where they
   * were. WASD is off while seated. A no-op if already seated. */
  sit(chair: ChairPose | null, view: SeatedView = chair ? 'chair' : 'table'): void {
    if (this.standingState) {
      return;
    }
    const object = this.controls.object;
    this.standingState = {
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
    };
    this.chair = chair;
    this.view = chair ? view : 'table';
    this.controls.unlock();
    this.applySeatedPose();
  }

  /** Switches between the chair and the top-down table view (seated only;
   * the chair view needs a chair). The table view releases mouse-look —
   * it's for drawing, rolling and pinging with the cursor. */
  setSeatedView(view: SeatedView): void {
    if (!this.standingState || (view === 'chair' && !this.chair) || view === this.view) {
      return;
    }
    this.view = view;
    if (view === 'table') {
      this.controls.unlock();
    }
    this.applySeatedPose();
  }

  /** The current seated view, or null while standing. */
  get seatedView(): SeatedView | null {
    return this.standingState ? this.view : null;
  }

  /** Whether there's a chair to look out from (vs. only the table view). */
  get hasChair(): boolean {
    return this.chair !== null;
  }

  private applySeatedPose(): void {
    const object = this.controls.object;
    const table = this.table;
    if (this.view === 'chair' && this.chair) {
      const { x, z, yaw } = this.chair;
      object.position.set(
        x + Math.sin(yaw) * SEATED_EYE_FORWARD,
        SEATED_EYE_HEIGHT,
        z + Math.cos(yaw) * SEATED_EYE_FORWARD,
      );
      // Facing the middle of the table, the way a seated player would.
      object.lookAt(table.center.x, table.height + 0.1, table.center.z);
      return;
    }
    object.position.set(table.center.x, seatedCameraHeight(table, this.camera.fov), table.center.z);
    object.lookAt(table.center.x, 0, table.center.z);
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
    this.chair = null;
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
