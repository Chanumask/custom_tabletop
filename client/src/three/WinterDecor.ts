import * as THREE from 'three';
import { seededRandom } from './parchment.js';
import { Kit, glowPointsMaterial } from './outside/kit.js';
import type { Obstacle } from './collision.js';
import type { RoomAsset } from './RoomLoader.js';

/** The tree stands against the north wall, between the bookshelf and the
 * whiteboard — clear of the soundboard, the windows and every seat. */
const TREE = { x: -2.55, z: -3.38, height: 2.05, radius: 0.6 };

/**
 * The room dressed for winter (docs/decisions.md, "The cozy room"): a
 * decorated tree with twinkling lights and a star, presents under it,
 * stockings hanging from the mantel, a garland along it, and a wreath on the
 * door. Placed from the room model like the Halloween decor, and like it,
 * no scene lights: the glows are emissive bulbs and halos.
 */
export class WinterDecor {
  private readonly group = new THREE.Group();
  private readonly kit: Kit;
  private readonly updates: ((dt: number, time: number) => void)[] = [];
  /** The tree's footprint: solid while the decorations are up. */
  readonly obstacle: Obstacle = {
    minX: TREE.x - 0.45,
    maxX: TREE.x + 0.45,
    minZ: TREE.z - 0.45,
    maxZ: TREE.z + 0.45,
  };

  constructor(scene: THREE.Scene, room: RoomAsset, reducedMotion = false) {
    this.kit = new Kit(reducedMotion);
    this.group.name = 'winter-decor';
    this.group.visible = false;
    scene.add(this.group);
    const glow = this.kit.glow();
    const box = (name: string) => {
      const node = room.object3D.getObjectByName(name);
      return node ? new THREE.Box3().setFromObject(node) : null;
    };
    this.addTree(glow);
    this.addPresents();
    const mantel = box('Fireplace_Mantel');
    if (mantel) {
      this.addStockings(mantel);
      this.addGarland(mantel, glow);
    }
    const door = box('Door_Leaf');
    if (door) this.addWreath(door);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
    // The wreath hangs on the door (it swings with it), outside the group.
    if (this.wreath) this.wreath.visible = visible;
  }

  get visible(): boolean {
    return this.group.visible;
  }

  /** Keeps glowing points the right size: the canvas height (CSS px) and fov. */
  setViewport(heightPx: number, fovDeg: number): void {
    this.kit.pointScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  update(dt: number, time: number): void {
    if (!this.group.visible) return;
    for (const update of this.updates) update(dt, time);
  }

  dispose(): void {
    this.kit.dispose();
    this.group.parent?.remove(this.group);
  }

  // --- The tree ------------------------------------------------------------

  private addTree(glow: THREE.Texture): void {
    const kit = this.kit;
    const random = seededRandom(0x7e3e);
    const tree = new THREE.Group();
    tree.position.set(TREE.x, 0, TREE.z);
    this.group.add(tree);

    // A stand and a trunk.
    const stand = new THREE.Mesh(
      kit.keep(new THREE.CylinderGeometry(0.2, 0.24, 0.18, 16)),
      kit.keep(new THREE.MeshStandardMaterial({ color: 0x7a2418, roughness: 0.6 })),
    );
    stand.position.y = 0.09;
    const trunk = new THREE.Mesh(
      kit.keep(new THREE.CylinderGeometry(0.05, 0.07, 0.4, 8)),
      kit.keep(new THREE.MeshStandardMaterial({ color: 0x4a3222, roughness: 0.9 })),
    );
    trunk.position.y = 0.3;
    tree.add(stand, trunk);

    // Branches: tiers of drooping, ragged cones, each a little rotated.
    const needles = kit.keep(
      new THREE.MeshStandardMaterial({ color: 0x1f4a2c, roughness: 0.85, flatShading: true }),
    );
    const tiers = 6;
    const top = TREE.height - 0.12;
    const tierSurfaces: { y: number; radius: number; height: number }[] = [];
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1);
      const radius = TREE.radius * (1 - t * 0.82);
      const height = 0.5 - t * 0.12;
      const y = 0.42 + t * (top - 0.42 - 0.3);
      const geometry = kit.keep(new THREE.ConeGeometry(radius, height, 14, 2, true));
      // Ragged branch tips, drooping at the rim.
      const positions = geometry.attributes.position!;
      for (let v = 0; v < positions.count; v++) {
        const px = positions.getX(v);
        const pz = positions.getZ(v);
        const r = Math.hypot(px, pz);
        if (r > radius * 0.6) {
          const jag = 1 + (random() - 0.5) * 0.18;
          positions.setX(v, px * jag);
          positions.setZ(v, pz * jag);
          positions.setY(v, positions.getY(v) - (random() * 0.05 + 0.02));
        }
      }
      geometry.computeVertexNormals();
      const cone = new THREE.Mesh(geometry, needles);
      cone.position.y = y + height / 2;
      cone.rotation.y = random() * Math.PI;
      tree.add(cone);
      tierSurfaces.push({ y, radius, height });
    }

    // A point on the tree's surface: at height fraction `h` (0 bottom, 1 top), angle `a`.
    const onTree = (h: number, a: number, inset = 0.03) => {
      const y = 0.45 + h * (top - 0.45);
      const radius = Math.max(0.05, TREE.radius * (1 - h * 0.9) - inset);
      return new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius);
    };

    // Baubles: glossy red, gold and silver.
    const bauble = kit.keep(new THREE.SphereGeometry(0.035, 12, 8));
    const baubleMaterials = [
      new THREE.MeshStandardMaterial({ color: 0xb01818, roughness: 0.2, metalness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: 0xd4a53a, roughness: 0.25, metalness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0xcfd6de, roughness: 0.15, metalness: 0.95 }),
      new THREE.MeshStandardMaterial({ color: 0x1a4ea8, roughness: 0.2, metalness: 0.6 }),
    ].map((material) => kit.keep(material));
    for (let i = 0; i < 34; i++) {
      const at = onTree(random() * 0.88, random() * Math.PI * 2, 0.02);
      const ball = new THREE.Mesh(bauble, baubleMaterials[i % baubleMaterials.length]!);
      ball.position.copy(at);
      ball.scale.setScalar(0.8 + random() * 0.6);
      tree.add(ball);
    }

    // Lights: a spiral of little bulbs, twinkling in warm colours.
    const count = 90;
    const bulbPositions: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      const h = i / count;
      bulbPositions.push(onTree(h * 0.92, h * Math.PI * 2 * 6.5, 0.0));
    }
    const colors = [
      new THREE.Color(1.8, 0.35, 0.25),
      new THREE.Color(0.35, 1.6, 0.45),
      new THREE.Color(1.8, 1.25, 0.4),
      new THREE.Color(1.6, 1.4, 1.1),
      new THREE.Color(0.45, 0.6, 1.8),
    ];
    const bulbGeometry = kit.keep(new THREE.SphereGeometry(0.012, 6, 4));
    const bulbMaterial = kit.keep(new THREE.MeshBasicMaterial({ toneMapped: false }));
    const bulbs = new THREE.InstancedMesh(bulbGeometry, bulbMaterial, count);
    const matrix = new THREE.Matrix4();
    bulbPositions.forEach((at, i) => {
      matrix.makeTranslation(at.x, at.y, at.z);
      bulbs.setMatrixAt(i, matrix);
      bulbs.setColorAt(i, colors[i % colors.length]!);
    });
    tree.add(bulbs);
    const glowPositions = new Float32Array(bulbPositions.flatMap((at) => [at.x, at.y, at.z]));
    const alphas = new Float32Array(count);
    const glowGeometry = kit.keep(new THREE.BufferGeometry());
    glowGeometry.setAttribute('position', new THREE.BufferAttribute(glowPositions, 3));
    glowGeometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    const glows = new THREE.Points(
      glowGeometry,
      kit.keep(glowPointsMaterial(glow, new THREE.Color(1, 0.75, 0.45), 0.09, kit.pointScale)),
    );
    glows.frustumCulled = false;
    tree.add(glows);
    const phases = bulbPositions.map(() => random() * Math.PI * 2);
    this.updates.push((_dt, time) => {
      for (let i = 0; i < count; i++) {
        const twinkle = kit.reducedMotion ? 0.8 : 0.55 + 0.45 * Math.sin(time * 1.3 + phases[i]!);
        alphas[i] = 0.35 * twinkle;
      }
      glowGeometry.attributes.alpha!.needsUpdate = true;
    });

    // The star on top.
    const starShape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 0.11 : 0.045;
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const star = new THREE.Mesh(
      kit.keep(
        new THREE.ExtrudeGeometry(starShape, {
          depth: 0.02,
          bevelEnabled: true,
          bevelSize: 0.006,
          bevelThickness: 0.006,
          bevelSegments: 1,
        }).translate(0, 0, -0.01),
      ),
      kit.keep(
        new THREE.MeshStandardMaterial({
          color: 0xffd36a,
          emissive: new THREE.Color(1, 0.75, 0.3),
          emissiveIntensity: 1.6,
          metalness: 0.8,
          roughness: 0.3,
        }),
      ),
    );
    star.position.set(0, TREE.height + 0.04, 0);
    // Facing the room's middle.
    star.rotation.y = Math.atan2(-TREE.x, -TREE.z);
    tree.add(star);
    const starHalo = kit.halo(glow, '#ffcf70', 0.55, 0.45);
    starHalo.position.copy(star.position);
    tree.add(starHalo);
    this.updates.push((_dt, time) => {
      starHalo.material.opacity = kit.reducedMotion ? 0.45 : 0.38 + 0.1 * Math.sin(time * 1.1);
    });
  }

  /** Wrapped presents under the tree, ribbons and all. */
  private addPresents(): void {
    const kit = this.kit;
    const random = seededRandom(0x6f7);
    const papers = [0x8a1c1c, 0x1c5a34, 0x2a3a78, 0xc8a24a].map((color) =>
      kit.keep(new THREE.MeshStandardMaterial({ color, roughness: 0.55 })),
    );
    const ribbons = [0xe8c060, 0xdddddd, 0xb82020].map((color) =>
      kit.keep(new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.3 })),
    );
    const spots: [number, number, number, number][] = [
      [-0.42, 0.28, 0.26, 0.2],
      [-0.1, 0.5, 0.22, 0.28],
      [0.3, 0.42, 0.3, 0.18],
      [-0.5, -0.1, 0.18, 0.16],
    ];
    spots.forEach(([dx, dz, size, height], i) => {
      const present = new THREE.Group();
      const body = new THREE.Mesh(
        kit.keep(new THREE.BoxGeometry(size, height, size * 0.85)),
        papers[i % papers.length]!,
      );
      body.position.y = height / 2;
      const ribbon = ribbons[i % ribbons.length]!;
      const bandA = new THREE.Mesh(
        kit.keep(new THREE.BoxGeometry(size * 1.02, height * 1.02, 0.025)),
        ribbon,
      );
      bandA.position.y = height / 2;
      const bandB = new THREE.Mesh(
        kit.keep(new THREE.BoxGeometry(0.025, height * 1.02, size * 0.87)),
        ribbon,
      );
      bandB.position.y = height / 2;
      const bow = new THREE.Mesh(kit.keep(new THREE.TorusGeometry(0.035, 0.012, 6, 12)), ribbon);
      bow.position.y = height + 0.02;
      bow.rotation.x = Math.PI / 2 + (random() - 0.5) * 0.6;
      present.add(body, bandA, bandB, bow);
      present.position.set(TREE.x + dx, 0, TREE.z + dz);
      present.rotation.y = random() * Math.PI;
      this.group.add(present);
    });
  }

  // --- The mantel ----------------------------------------------------------

  /** Four stockings hanging from the mantel's front edge, over the hearth. */
  private addStockings(mantel: THREE.Box3): void {
    const kit = this.kit;
    const size = mantel.getSize(new THREE.Vector3());
    const front = mantel.max.x; // the mantel faces the room (+x)
    // The classic stocking outline: leg, heel, toe.
    const outline = new THREE.Shape();
    outline.moveTo(-0.055, 0);
    outline.lineTo(0.055, 0);
    outline.lineTo(0.055, -0.2);
    outline.quadraticCurveTo(0.06, -0.26, 0.12, -0.27);
    outline.quadraticCurveTo(0.16, -0.28, 0.16, -0.31);
    outline.quadraticCurveTo(0.15, -0.35, 0.06, -0.35);
    outline.lineTo(-0.02, -0.35);
    outline.quadraticCurveTo(-0.065, -0.34, -0.06, -0.28);
    outline.lineTo(-0.055, 0);
    const body = kit.keep(
      new THREE.ExtrudeGeometry(outline, {
        depth: 0.04,
        bevelEnabled: true,
        bevelSize: 0.012,
        bevelThickness: 0.012,
        bevelSegments: 2,
        curveSegments: 8,
      }).translate(0, 0, -0.02),
    );
    const cuff = kit.keep(new THREE.BoxGeometry(0.14, 0.055, 0.07).translate(0, -0.02, 0));
    const colors = [0xa01818, 0x1c5a34, 0xa01818, 0x2a3a78];
    const felt = colors.map((color) =>
      kit.keep(new THREE.MeshStandardMaterial({ color, roughness: 0.95 })),
    );
    const fur = kit.keep(new THREE.MeshStandardMaterial({ color: 0xf0ece4, roughness: 1 }));
    const middle = mantel.getCenter(new THREE.Vector3());
    [-0.36, -0.12, 0.12, 0.36].forEach((t, i) => {
      const stocking = new THREE.Group();
      stocking.add(new THREE.Mesh(body, felt[i]!), new THREE.Mesh(cuff, fur));
      // Hanging just under the mantel shelf, facing the room, toes to the side.
      stocking.position.set(front + 0.025, mantel.min.y - 0.01, middle.z + size.z * t);
      stocking.rotation.y = Math.PI / 2;
      this.group.add(stocking);
    });
  }

  /** A garland along the mantel shelf, with little warm lights in it. */
  private addGarland(mantel: THREE.Box3, glow: THREE.Texture): void {
    const kit = this.kit;
    const random = seededRandom(0x6a7);
    const size = mantel.getSize(new THREE.Vector3());
    const middle = mantel.getCenter(new THREE.Vector3());
    const front = mantel.max.x - 0.03;
    // A sagging curve along the front edge.
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const z = middle.z - size.z * 0.48 + size.z * 0.96 * t;
      const sag = Math.sin(t * Math.PI * 3) ** 2 * 0.06;
      points.push(new THREE.Vector3(front, mantel.max.y + 0.02 - sag, z));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const tube = new THREE.Mesh(
      kit.keep(new THREE.TubeGeometry(curve, 96, 0.04, 7, false)),
      kit.keep(
        new THREE.MeshStandardMaterial({ color: 0x1f4a2c, roughness: 0.9, flatShading: true }),
      ),
    );
    // Roughen it into needles.
    const positions = tube.geometry.attributes.position!;
    for (let v = 0; v < positions.count; v++) {
      positions.setXYZ(
        v,
        positions.getX(v) + (random() - 0.5) * 0.02,
        positions.getY(v) + (random() - 0.5) * 0.02,
        positions.getZ(v) + (random() - 0.5) * 0.02,
      );
    }
    tube.geometry.computeVertexNormals();
    this.group.add(tube);
    const lights = Array.from({ length: 22 }, (_, i) => curve.getPointAt((i + 0.5) / 22));
    const glowPositions = new Float32Array(lights.flatMap((at) => [at.x + 0.03, at.y, at.z]));
    const alphas = new Float32Array(lights.length);
    const geometry = kit.keep(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(glowPositions, 3));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    const points_ = new THREE.Points(
      geometry,
      kit.keep(glowPointsMaterial(glow, new THREE.Color(1.6, 1.05, 0.5), 0.07, kit.pointScale)),
    );
    points_.frustumCulled = false;
    this.group.add(points_);
    const phases = lights.map(() => random() * Math.PI * 2);
    this.updates.push((_dt, time) => {
      for (let i = 0; i < lights.length; i++) {
        alphas[i] = kit.reducedMotion ? 0.6 : 0.4 + 0.3 * Math.sin(time * 0.9 + phases[i]!);
      }
      geometry.attributes.alpha!.needsUpdate = true;
    });
  }

  // --- The door ------------------------------------------------------------

  /** A wreath on the door, with a red bow. */
  private addWreath(door: THREE.Box3): void {
    const kit = this.kit;
    const random = seededRandom(0x3e47);
    const middle = door.getCenter(new THREE.Vector3());
    const wreath = new THREE.Group();
    const ring = new THREE.Mesh(
      kit.keep(new THREE.TorusGeometry(0.17, 0.055, 8, 28)),
      kit.keep(
        new THREE.MeshStandardMaterial({ color: 0x1f4a2c, roughness: 0.9, flatShading: true }),
      ),
    );
    const positions = ring.geometry.attributes.position!;
    for (let v = 0; v < positions.count; v++) {
      positions.setXYZ(
        v,
        positions.getX(v) + (random() - 0.5) * 0.025,
        positions.getY(v) + (random() - 0.5) * 0.025,
        positions.getZ(v) + (random() - 0.5) * 0.015,
      );
    }
    ring.geometry.computeVertexNormals();
    wreath.add(ring);
    // Sprigs of fir all round it, in two greens, fanning out from the ring.
    const sprig = kit.keep(new THREE.ConeGeometry(0.022, 0.085, 5));
    const needles = [0x2b5e36, 0x173d24].map((color) =>
      kit.keep(new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true })),
    );
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2 + random() * 0.12;
      const r = 0.17 + (random() - 0.5) * 0.07;
      const tuft = new THREE.Mesh(sprig, needles[i % 2]!);
      tuft.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.025 + random() * 0.03);
      // Pointing round the ring, splayed a little outward and toward the room.
      tuft.rotation.set(
        0.5 * (random() - 0.2),
        0.4 * (random() - 0.5),
        a + Math.PI + (random() - 0.5) * 0.6,
      );
      wreath.add(tuft);
    }
    // Holly berries in little clusters of three, round all but the bottom
    // (where the bow is): from the bow's right, up over the top, to its left.
    const berry = kit.keep(new THREE.SphereGeometry(0.012, 8, 6));
    const red = kit.keep(new THREE.MeshStandardMaterial({ color: 0xb01818, roughness: 0.3 }));
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + 0.8 + (i / 5) * (Math.PI * 2 - 1.6) + (random() - 0.5) * 0.2;
      for (let j = 0; j < 3; j++) {
        const dot = new THREE.Mesh(berry, red);
        const b = a + (j - 1) * 0.09;
        dot.position.set(Math.cos(b) * 0.17, Math.sin(b) * 0.17 + (j === 1 ? 0.012 : 0), 0.06);
        wreath.add(dot);
      }
    }
    // A velvet bow at the bottom: two loops flaring out, a knot, two tails.
    const bowMaterial = kit.keep(
      new THREE.MeshStandardMaterial({ color: 0xa81818, roughness: 0.55 }),
    );
    const loopGeometry = kit.keep(new THREE.TorusGeometry(0.04, 0.016, 8, 16));
    const tailGeometry = kit.keep(new THREE.BoxGeometry(0.03, 0.1, 0.008));
    for (const side of [-1, 1]) {
      const loop = new THREE.Mesh(loopGeometry, bowMaterial);
      loop.position.set(side * 0.045, -0.165, 0.065);
      loop.scale.set(1.15, 0.6, 1);
      loop.rotation.z = side * 0.35;
      const tail = new THREE.Mesh(tailGeometry, bowMaterial);
      tail.position.set(side * 0.022, -0.23, 0.062);
      tail.rotation.z = side * 0.3;
      wreath.add(loop, tail);
    }
    const knot = new THREE.Mesh(kit.keep(new THREE.SphereGeometry(0.022, 10, 8)), bowMaterial);
    knot.position.set(0, -0.165, 0.07);
    knot.scale.set(1, 1.1, 0.7);
    wreath.add(knot);
    // On the room side of the door, above the knob.
    wreath.position.set(middle.x, 1.6, door.min.z - 0.06);
    wreath.rotation.y = Math.PI;
    this.group.add(wreath);
    this.wreath = wreath;
  }

  /** The wreath swings with the door (RoomDoor moves it into its hinge). */
  wreath: THREE.Object3D | null = null;
}
