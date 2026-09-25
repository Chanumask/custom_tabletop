import * as THREE from 'three';
import { seededRandom } from './parchment.js';
import { Kit, glowPointsMaterial } from './outside/kit.js';
import { carvedFaceTexture, pumpkinGeometry } from './outside/halloween.js';
import type { RoomAsset } from './RoomLoader.js';

/**
 * The room dressed for Halloween (docs/decisions.md, "Halloween"): carved
 * pumpkins on the hearth, mantel, sills and TV, cobwebs in the corners,
 * candles floating under the ceiling, paper bats swinging from the beams,
 * and a cauldron bubbling green on the hearth. Placed from the room model
 * itself, so it follows the room if the room changes. No scene lights —
 * the glows are emissive surfaces and halos (adding or removing a light
 * would recompile every material in the room).
 */
export class HalloweenDecor {
  private readonly group = new THREE.Group();
  private readonly kit: Kit;
  private readonly updates: ((dt: number, time: number) => void)[] = [];

  constructor(scene: THREE.Scene, room: RoomAsset, reducedMotion = false) {
    this.kit = new Kit(reducedMotion);
    this.group.name = 'halloween-decor';
    this.group.visible = false;
    scene.add(this.group);
    const glow = this.kit.glow();
    const box = (name: string) => {
      const node = room.object3D.getObjectByName(name);
      return node ? new THREE.Box3().setFromObject(node) : null;
    };
    this.addPumpkins(room, box, glow);
    this.addCauldron(box, glow);
    this.addCobwebs(room, box);
    this.addFloatingCandles(room, glow);
    this.addPaperBats(room);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
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

  // --- Jack-o'-lanterns ------------------------------------------------------

  private addPumpkins(
    room: RoomAsset,
    box: (name: string) => THREE.Box3 | null,
    glow: THREE.Texture,
  ): void {
    const kit = this.kit;
    const random = seededRandom(0x1a7e);
    const face = carvedFaceTexture(kit);
    const geometry = kit.keep(pumpkinGeometry(1));
    const stem = kit.keep(new THREE.CylinderGeometry(0.09, 0.13, 0.42, 6).translate(0, 0.85, 0));
    const stemMaterial = kit.keep(new THREE.MeshLambertMaterial({ color: '#4a5a22' }));
    const lit = [0, 1].map(() =>
      kit.keep(
        new THREE.MeshLambertMaterial({
          color: '#d2641a',
          emissive: new THREE.Color('#ff8a2a'),
          emissiveMap: face,
          emissiveIntensity: 2.4,
        }),
      ),
    );
    const halos: THREE.Sprite[] = [];
    const center = new THREE.Vector3(
      (room.layout.bounds.minX + room.layout.bounds.maxX) / 2,
      0,
      (room.layout.bounds.minZ + room.layout.bounds.maxZ) / 2,
    );
    /** A pumpkin sitting on `y`, its face turned to the room's middle. */
    const place = (x: number, y: number, z: number, radius: number) => {
      const pumpkin = new THREE.Group();
      pumpkin.add(
        new THREE.Mesh(geometry, lit[Math.floor(random() * lit.length)]!),
        new THREE.Mesh(stem, stemMaterial),
      );
      pumpkin.scale.setScalar(radius);
      pumpkin.position.set(x, y + radius * 0.72, z);
      pumpkin.rotation.y = Math.atan2(center.x - x, center.z - z) + (random() - 0.5) * 0.4;
      const halo = kit.halo(glow, '#ff8a2a', radius * 4.5, 0.4);
      halo.position.copy(pumpkin.position);
      this.group.add(pumpkin, halo);
      halos.push(halo);
    };

    const mantel = box('Fireplace_Mantel');
    if (mantel) {
      const size = mantel.getSize(new THREE.Vector3());
      const alongZ = size.z > size.x;
      const middle = mantel.getCenter(new THREE.Vector3());
      for (const t of [-0.38, 0.4]) {
        place(
          alongZ ? middle.x : middle.x + size.x * t,
          mantel.max.y,
          alongZ ? middle.z + size.z * t : middle.z,
          0.085,
        );
      }
    }
    const hearth = box('Fireplace_Hearth');
    if (hearth) {
      const size = hearth.getSize(new THREE.Vector3());
      const middle = hearth.getCenter(new THREE.Vector3());
      place(middle.x, hearth.max.y, middle.z - size.z * 0.4, 0.17);
    }
    for (const name of ['Window_Sill', 'WinE1_Sill', 'WinE2_Sill', 'WinW1_Sill', 'WinW2_Sill']) {
      const sill = box(name);
      if (!sill) continue;
      const size = sill.getSize(new THREE.Vector3());
      const middle = sill.getCenter(new THREE.Vector3());
      const alongZ = size.z > size.x;
      const t = random() < 0.5 ? -0.32 : 0.32;
      place(
        alongZ ? middle.x : middle.x + size.x * t,
        sill.max.y,
        alongZ ? middle.z + size.z * t : middle.z,
        0.075,
      );
    }
    const tv = box('TV_Cabinet');
    if (tv) {
      const size = tv.getSize(new THREE.Vector3());
      place(tv.min.x + size.x * 0.12, tv.max.y, tv.getCenter(new THREE.Vector3()).z, 0.1);
    }

    this.updates.push((_dt, time) => {
      if (this.kit.reducedMotion) return;
      lit.forEach((material, index) => {
        material.emissiveIntensity =
          2.2 + 0.5 * Math.sin(time * 9.5 + index * 2) + 0.3 * Math.sin(time * 15.7 + index);
      });
      halos.forEach((halo, index) => {
        halo.material.opacity = 0.36 + 0.08 * Math.sin(time * 8.3 + index * 1.7);
      });
    });
  }

  // --- The cauldron -------------------------------------------------------

  private addCauldron(box: (name: string) => THREE.Box3 | null, glow: THREE.Texture): void {
    const hearth = box('Fireplace_Hearth');
    if (!hearth) return;
    const kit = this.kit;
    const size = hearth.getSize(new THREE.Vector3());
    const middle = hearth.getCenter(new THREE.Vector3());
    const cauldron = new THREE.Group();
    const iron = kit.keep(
      new THREE.MeshStandardMaterial({ color: '#16151a', roughness: 0.55, metalness: 0.3 }),
    );
    const profile = [
      [0.02, 0.0],
      [0.14, 0.02],
      [0.21, 0.09],
      [0.23, 0.18],
      [0.21, 0.27],
      [0.17, 0.31],
      [0.19, 0.33],
      [0.17, 0.34],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const pot = new THREE.Mesh(kit.keep(new THREE.LatheGeometry(profile, 28)), iron);
    pot.position.y = 0.07;
    const legGeometry = kit.keep(new THREE.CylinderGeometry(0.018, 0.012, 0.1, 6));
    for (let i = 0; i < 3; i += 1) {
      const leg = new THREE.Mesh(legGeometry, iron);
      const angle = (i / 3) * Math.PI * 2;
      leg.position.set(Math.cos(angle) * 0.12, 0.05, Math.sin(angle) * 0.12);
      cauldron.add(leg);
    }
    const brew = new THREE.Mesh(
      kit.keep(new THREE.CircleGeometry(0.165, 24)),
      // Not tone-mapped: a vivid potion green, not a blown-out white.
      kit.keep(new THREE.MeshBasicMaterial({ color: '#4dff5e', toneMapped: false })),
    );
    brew.rotation.x = -Math.PI / 2;
    brew.position.y = 0.07 + 0.29;
    const halo = kit.halo(glow, '#6aff7a', 0.9, 0.45);
    halo.position.y = 0.5;
    cauldron.add(pot, brew, halo);

    // Bubbles rising off the brew and popping.
    const count = 26;
    const random = seededRandom(0xb0b);
    const positions = new Float32Array(count * 3);
    const alphas = new Float32Array(count);
    const bubbles = Array.from({ length: count }, () => ({
      x: 0,
      z: 0,
      age: random() * 1.4,
      life: 0.8 + random() * 0.8,
    }));
    const geometry = kit.keep(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    const points = new THREE.Points(
      geometry,
      kit.keep(glowPointsMaterial(glow, new THREE.Color(0.6, 2.2, 0.7), 0.035, kit.pointScale)),
    );
    points.frustumCulled = false;
    cauldron.add(points);
    cauldron.position.set(middle.x, hearth.max.y, middle.z + size.z * 0.36);
    this.group.add(cauldron);

    this.updates.push((dt) => {
      bubbles.forEach((bubble, i) => {
        bubble.age += this.kit.reducedMotion ? 0 : dt;
        if (bubble.age > bubble.life) {
          bubble.age = 0;
          const angle = random() * Math.PI * 2;
          const r = random() * 0.13;
          bubble.x = Math.cos(angle) * r;
          bubble.z = Math.sin(angle) * r;
        }
        const t = bubble.age / bubble.life;
        positions[i * 3] = bubble.x;
        positions[i * 3 + 1] = 0.37 + t * 0.35;
        positions[i * 3 + 2] = bubble.z;
        alphas[i] = Math.sin(t * Math.PI) * 0.9;
      });
      geometry.attributes.position!.needsUpdate = true;
      geometry.attributes.alpha!.needsUpdate = true;
    });
  }

  // --- Cobwebs --------------------------------------------------------------

  private addCobwebs(room: RoomAsset, box: (name: string) => THREE.Box3 | null): void {
    const kit = this.kit;
    const web = kit.canvasTexture(256, 256, (ctx) => {
      // A fan of threads from the top middle (the corner behind it)...
      const origin = { x: 128, y: 0 };
      ctx.strokeStyle = 'rgba(235, 235, 240, 0.55)';
      ctx.lineWidth = 1.4;
      const spokes = 9;
      const ends: { x: number; y: number }[] = [];
      for (let i = 0; i < spokes; i += 1) {
        const angle = (i / (spokes - 1)) * Math.PI;
        const reach = 150 + (i % 2) * 60;
        const end = {
          x: origin.x + Math.cos(angle) * reach,
          y: origin.y + Math.sin(angle) * reach,
        };
        ends.push(end);
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
      // ...joined by sagging rings.
      ctx.lineWidth = 1;
      for (let ring = 1; ring <= 7; ring += 1) {
        const r = ring / 8;
        ctx.beginPath();
        for (let i = 0; i < spokes; i += 1) {
          const end = ends[i]!;
          const x = origin.x + (end.x - origin.x) * r;
          const y = origin.y + (end.y - origin.y) * r;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            const previous = ends[i - 1]!;
            const px = origin.x + (previous.x - origin.x) * r;
            const py = origin.y + (previous.y - origin.y) * r;
            ctx.quadraticCurveTo((x + px) / 2 - (x - px) * 0.05, (y + py) / 2 - 6 * r, x, y);
          }
        }
        ctx.stroke();
      }
    });
    const material = kit.keep(
      new THREE.MeshBasicMaterial({
        map: web,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        color: '#d8d4dc',
      }),
    );
    const geometry = kit.keep(new THREE.PlaneGeometry(1, 1));
    const { bounds, wallHeight } = room.layout;
    const spread = (x: number, y: number, z: number, size: number) => {
      const webMesh = new THREE.Mesh(geometry, material);
      // Across the corner, facing into the room.
      const inward = new THREE.Vector3(
        Math.sign((bounds.minX + bounds.maxX) / 2 - x),
        0,
        Math.sign((bounds.minZ + bounds.maxZ) / 2 - z),
      ).normalize();
      webMesh.position.set(x + inward.x * size * 0.35, y - size * 0.5, z + inward.z * size * 0.35);
      webMesh.lookAt(webMesh.position.clone().add(inward));
      webMesh.scale.setScalar(size);
      this.group.add(webMesh);
    };
    for (const x of [bounds.minX, bounds.maxX]) {
      for (const z of [bounds.minZ, bounds.maxZ]) {
        spread(x, wallHeight, z, 1.1);
      }
    }
    const shelf = box('wooden_bookshelf_worn');
    if (shelf) spread(shelf.min.x, shelf.max.y + 0.45, shelf.min.z, 0.6);
  }

  // --- Floating candles ---------------------------------------------------

  private addFloatingCandles(room: RoomAsset, glow: THREE.Texture): void {
    const kit = this.kit;
    const flame = kit.canvasTexture(32, 64, (ctx) => {
      const gradient = ctx.createRadialGradient(16, 44, 1, 16, 38, 22);
      gradient.addColorStop(0, 'rgba(255, 250, 225, 1)');
      gradient.addColorStop(0.35, 'rgba(255, 190, 90, 0.9)');
      gradient.addColorStop(1, 'rgba(255, 110, 30, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(16, 62);
      ctx.bezierCurveTo(0, 54, 4, 30, 16, 2);
      ctx.bezierCurveTo(28, 30, 32, 54, 16, 62);
      ctx.fill();
    });
    const wax = kit.keep(new THREE.MeshLambertMaterial({ color: '#efe6d2', emissive: '#3a2a18' }));
    const random = seededRandom(0xca7d);
    const { bounds, wallHeight } = room.layout;
    const candles: { holder: THREE.Group; baseY: number; phase: number; flame: THREE.Sprite }[] =
      [];
    const spots: [number, number][] = [];
    // Around the room, well in from the walls and clear of the table.
    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * Math.PI * 2 + random() * 0.2;
      spots.push([Math.cos(angle) * (bounds.maxX - 1.3), Math.sin(angle) * (bounds.maxZ - 1.1)]);
    }
    for (const [x, z] of spots) {
      const height = 0.12 + random() * 0.12;
      const holder = new THREE.Group();
      const body = new THREE.Mesh(
        kit.keep(new THREE.CylinderGeometry(0.018, 0.02, height, 10).translate(0, height / 2, 0)),
        wax,
      );
      const flameSprite = new THREE.Sprite(
        kit.keep(
          new THREE.SpriteMaterial({
            map: flame,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        ),
      );
      flameSprite.scale.set(0.035, 0.07, 1);
      flameSprite.position.y = height + 0.035;
      const halo = kit.halo(glow, '#ffb060', 0.35, 0.35);
      halo.position.y = height + 0.03;
      holder.add(body, flameSprite, halo);
      const baseY = wallHeight - 0.55 - random() * 0.25; // above head height
      holder.position.set(x, baseY, z);
      this.group.add(holder);
      candles.push({ holder, baseY, phase: random() * 10, flame: flameSprite });
    }
    this.updates.push((_dt, time) => {
      for (const candle of candles) {
        const still = this.kit.reducedMotion ? 0 : 1;
        candle.holder.position.y =
          candle.baseY + still * Math.sin(time * 0.6 + candle.phase) * 0.06;
        candle.holder.rotation.z = still * Math.sin(time * 0.45 + candle.phase) * 0.04;
        candle.flame.scale.y = 0.07 * (1 + still * 0.12 * Math.sin(time * 13 + candle.phase));
      }
    });
  }

  // --- Paper bats on strings ----------------------------------------------

  private addPaperBats(room: RoomAsset): void {
    const kit = this.kit;
    const texture = kit.canvasTexture(128, 64, (ctx) => {
      ctx.fillStyle = '#0b0a0d';
      ctx.beginPath();
      ctx.moveTo(64, 26);
      for (const side of [-1, 1]) {
        ctx.moveTo(64, 26);
        ctx.quadraticCurveTo(64 + side * 22, 6, 64 + side * 60, 14);
        ctx.quadraticCurveTo(64 + side * 50, 24, 64 + side * 54, 38);
        ctx.quadraticCurveTo(64 + side * 42, 32, 64 + side * 38, 44);
        ctx.quadraticCurveTo(64 + side * 28, 36, 64 + side * 18, 46);
        ctx.quadraticCurveTo(64 + side * 10, 38, 64, 42);
      }
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(64, 32, 8, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(64 + side * 3, 22);
        ctx.lineTo(64 + side * 8, 12);
        ctx.lineTo(64 + side * 8, 24);
        ctx.fill();
      }
    });
    const material = kit.keep(
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide }),
    );
    const geometry = kit.keep(new THREE.PlaneGeometry(0.3, 0.15));
    const stringMaterial = kit.keep(new THREE.LineBasicMaterial({ color: '#2a2622' }));
    const random = seededRandom(0xba75);
    const bats: { pivot: THREE.Group; phase: number }[] = [];
    for (const beam of room.beams) {
      const size = beam.getSize(new THREE.Vector3());
      const alongX = size.x >= size.z;
      for (let i = 0; i < 3; i += 1) {
        const t = 0.18 + i * 0.3 + random() * 0.1;
        const x = alongX ? beam.min.x + size.x * t : (beam.min.x + beam.max.x) / 2;
        const z = alongX ? (beam.min.z + beam.max.z) / 2 : beam.min.z + size.z * t;
        const drop = 0.35 + random() * 0.4;
        const pivot = new THREE.Group();
        pivot.position.set(x, beam.min.y, z);
        const bat = new THREE.Mesh(geometry, material);
        bat.position.y = -drop;
        bat.rotation.y = random() * Math.PI;
        const string = new THREE.Line(
          kit.keep(
            new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(0, 0, 0),
              new THREE.Vector3(0, -drop + 0.04, 0),
            ]),
          ),
          stringMaterial,
        );
        pivot.add(string, bat);
        this.group.add(pivot);
        bats.push({ pivot, phase: random() * 10 });
      }
    }
    this.updates.push((_dt, time) => {
      if (this.kit.reducedMotion) return;
      for (const bat of bats) {
        bat.pivot.rotation.z = Math.sin(time * 0.9 + bat.phase) * 0.08;
        bat.pivot.rotation.y = Math.sin(time * 0.35 + bat.phase) * 0.6;
      }
    });
  }
}
