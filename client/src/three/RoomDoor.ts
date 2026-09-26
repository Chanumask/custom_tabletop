import * as THREE from 'three';

/** How far the door swings open (radians), into the room. */
const OPEN_ANGLE = 1.25;
/** Seconds to swing fully open or shut. */
const SWING_SECONDS = 0.8;

/**
 * The room's door (`Door_Leaf` and `Door_Knob` in the model), hung on a
 * hinge so it can swing: when someone joins, they knock, it opens, they
 * walk in, and it falls shut behind them (RoomView drives the timing).
 */
export class RoomDoor {
  private readonly pivot = new THREE.Group();
  private angle = 0;
  private target = 0;
  /** Where to stand just inside the doorway, and where the sound comes from. */
  readonly threshold: THREE.Vector3;
  readonly soundSpot: { x: number; z: number };

  private constructor(leaf: THREE.Object3D, knob: THREE.Object3D | null) {
    const box = new THREE.Box3().setFromObject(leaf);
    // The hinge is on the leaf's west edge; the knob is on the east.
    this.pivot.name = 'door-hinge';
    this.pivot.position.set(box.min.x, 0, (box.min.z + box.max.z) / 2);
    leaf.parent?.add(this.pivot);
    this.pivot.updateMatrixWorld(true);
    this.pivot.attach(leaf);
    if (knob) this.pivot.attach(knob);
    const middle = box.getCenter(new THREE.Vector3());
    this.threshold = new THREE.Vector3(middle.x, 0, box.min.z - 0.55);
    this.soundSpot = { x: middle.x, z: box.min.z };

    // The wall has no hole behind the door: an open door would show plaster.
    // A dark hallway, just in front of the wall, that the closed leaf covers.
    const size = box.getSize(new THREE.Vector3());
    this.hallTexture = hallwayTexture();
    this.hall = new THREE.Mesh(
      new THREE.PlaneGeometry(size.x - 0.01, size.y - 0.005),
      new THREE.MeshBasicMaterial({ map: this.hallTexture }),
    );
    this.hall.name = 'doorway-hall';
    this.hall.position.set(middle.x, box.min.y + size.y / 2, box.max.z - 0.004);
    this.hall.rotation.y = Math.PI;
    leaf.parent?.add(this.hall);
  }

  private readonly hall: THREE.Mesh;
  private readonly hallTexture: THREE.Texture;

  dispose(): void {
    this.hall.parent?.remove(this.hall);
    this.hall.geometry.dispose();
    (this.hall.material as THREE.Material).dispose();
    this.hallTexture.dispose();
  }

  /** The door in `root`, or null for a model without one. */
  static fromRoom(root: THREE.Object3D): RoomDoor | null {
    const leaf = root.getObjectByName('Door_Leaf');
    if (!leaf) return null;
    return new RoomDoor(leaf, root.getObjectByName('Door_Knob') ?? null);
  }

  /** Swing open (true) or shut (false); `update` moves it there. */
  setOpen(open: boolean): void {
    this.target = open ? OPEN_ANGLE : 0;
  }

  get isOpen(): boolean {
    return this.target > 0;
  }

  update(dt: number): void {
    if (this.angle === this.target) return;
    const step = (OPEN_ANGLE / SWING_SECONDS) * dt;
    this.angle =
      this.angle < this.target
        ? Math.min(this.target, this.angle + step)
        : Math.max(this.target, this.angle - step);
    // Eased: a door starts and settles gently rather than at constant speed.
    const t = this.angle / OPEN_ANGLE;
    this.pivot.rotation.y = OPEN_ANGLE * (t * t * (3 - 2 * t));
  }
}

/** A dim hallway seen through the doorway: dark boards running away, a
 * faint warm lamp far down the corridor. Painted once. */
function hallwayTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const wall = ctx.createLinearGradient(0, 0, 0, 256);
    wall.addColorStop(0, '#0b0806');
    wall.addColorStop(0.55, '#1a120c');
    wall.addColorStop(1, '#0d0906');
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, 128, 256);
    // The far end of the corridor, faintly lit.
    const glow = ctx.createRadialGradient(64, 120, 2, 64, 120, 70);
    glow.addColorStop(0, 'rgba(255, 170, 90, 0.35)');
    glow.addColorStop(0.4, 'rgba(160, 90, 40, 0.12)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 128, 256);
    // Floorboards converging toward the far end.
    ctx.strokeStyle = 'rgba(90, 60, 35, 0.35)';
    ctx.lineWidth = 1;
    for (let i = -4; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(64 + i * 22, 256);
      ctx.lineTo(64 + i * 4, 150);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
