import * as THREE from 'three';

/** One ring's life: it grows from a dot to `RING_RADIUS` and fades out. */
const RING_SECONDS = 1.1;
const RING_RADIUS = 0.2;
/** Three rings, one after another — reads as a "ping", not a splash. */
const RING_COUNT = 3;
const RING_STAGGER = 0.28;
/** The center mark lingers a little after the last ring. */
const MARK_SECONDS = 2.2;
const MARK_RADIUS = 0.022;
/** Just above the table top, so it never z-fights the map texture. */
const LIFT = 0.004;

interface Ping {
  group: THREE.Group;
  rings: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[];
  mark: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  age: number;
}

/**
 * Pings on the table ("look here!"): rings pulse outward from the spot in
 * the pinger's color, over a small center mark. Unlit and drawn on top of
 * the map (like the table's own texture), so they read on any background.
 */
export class TablePings {
  private readonly group = new THREE.Group();
  private readonly pings: Ping[] = [];
  private readonly ringGeometry = new THREE.RingGeometry(0.8, 1, 48);
  private readonly markGeometry = new THREE.CircleGeometry(MARK_RADIUS, 24);

  constructor(scene: THREE.Scene) {
    this.group.name = 'table-pings';
    scene.add(this.group);
  }

  /** Shows a ping at a point on the table surface (world coordinates). */
  ping(x: number, surfaceY: number, z: number, colorHex: string): void {
    const group = new THREE.Group();
    group.position.set(x, surfaceY + LIFT, z);
    group.rotation.x = -Math.PI / 2; // lie flat on the table

    const material = () =>
      new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      });
    const rings = Array.from({ length: RING_COUNT }, () => {
      const ring = new THREE.Mesh(this.ringGeometry, material());
      ring.visible = false;
      ring.renderOrder = 5;
      group.add(ring);
      return ring;
    });
    const mark = new THREE.Mesh(this.markGeometry, material());
    mark.renderOrder = 5;
    group.add(mark);

    this.group.add(group);
    this.pings.push({ group, rings, mark, age: 0 });
  }

  update(deltaSeconds: number): void {
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const ping = this.pings[i]!;
      ping.age += deltaSeconds;
      ping.rings.forEach((ring, index) => {
        const t = (ping.age - index * RING_STAGGER) / RING_SECONDS;
        ring.visible = t > 0 && t < 1;
        if (ring.visible) {
          const radius = RING_RADIUS * (0.15 + 0.85 * (1 - (1 - t) ** 2));
          ring.scale.setScalar(radius);
          ring.material.opacity = 0.9 * (1 - t);
        }
      });
      const markLife = ping.age / MARK_SECONDS;
      ping.mark.material.opacity = markLife < 0.75 ? 0.95 : 0.95 * (1 - (markLife - 0.75) / 0.25);
      if (markLife >= 1) {
        this.remove(i);
      }
    }
  }

  /** How many pings are showing right now — for tests. */
  get active(): number {
    return this.pings.length;
  }

  dispose(): void {
    while (this.pings.length > 0) {
      this.remove(this.pings.length - 1);
    }
    this.ringGeometry.dispose();
    this.markGeometry.dispose();
    this.group.parent?.remove(this.group);
  }

  private remove(index: number): void {
    const [ping] = this.pings.splice(index, 1);
    if (!ping) {
      return;
    }
    this.group.remove(ping.group);
    ping.rings.forEach((ring) => ring.material.dispose());
    ping.mark.material.dispose();
  }
}
