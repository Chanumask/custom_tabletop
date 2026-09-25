import * as THREE from 'three';
import type { RoomAsset } from './RoomLoader.js';

/**
 * Everything that makes the room feel lived-in and warm, beyond its static
 * geometry: a crackling fire with drifting sparks and a flickering light,
 * candle flames that flicker and glow, fairy lights twinkling along the
 * beams, a starry night outside the window, and dust drifting through the
 * lamplight. Glows are additive halo sprites/points rather than a bloom
 * post-process — a post-process would tone-map the whole frame, including
 * the table's map, which must stay in its true colors.
 *
 * Driven by `update(dt, time)` from the render loop. With the room light
 * switched off, the fire and candles stay lit (they're the cozy part).
 */
export class Ambience {
  private readonly group = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];
  private readonly updaters: ((dt: number, time: number) => void)[] = [];
  private readonly lights: { light: THREE.PointLight; base: number }[] = [];
  private roomLightsOn = true;
  private readonly pointMaterials: THREE.ShaderMaterial[] = [];

  constructor(
    scene: THREE.Scene,
    room: RoomAsset,
    private readonly reducedMotion = false,
  ) {
    this.group.name = 'ambience';
    scene.add(this.group);
    const glow = this.keep(makeGlowTexture());
    if (room.fireSpot) this.buildFire(room.fireSpot, room.embers, glow);
    if (room.flames.length > 0) this.buildFlames(room.flames, glow);
    for (const spot of room.glowSpots) this.addHalo(spot, 0.32, 0xffb866, 0.5, glow);
    if (room.chandelier) this.buildChandelierGlow(room.chandelier, glow);
    if (room.beams.length > 0) this.buildFairyLights(room.beams, glow);
    if (room.windowView) this.buildWindow(room.windowView);
    this.buildDust(room);
  }

  update(dt: number, time: number): void {
    for (const update of this.updaters) update(dt, time);
  }

  /** The room light switch: the fire and candles keep burning, but their
   * light carries a little further in the dark. */
  setRoomLightsOn(on: boolean): void {
    this.roomLightsOn = on;
  }

  /** Keeps glow points the right size on screen: pass the canvas height in
   * CSS pixels and the camera's vertical field of view. */
  setViewport(heightPx: number, fovDeg: number): void {
    const scale = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
    for (const material of this.pointMaterials) material.uniforms.scale!.value = scale;
  }

  dispose(): void {
    this.disposables.forEach((item) => item.dispose());
    this.group.parent?.remove(this.group);
  }

  private points(material: THREE.ShaderMaterial): THREE.ShaderMaterial {
    this.pointMaterials.push(material);
    return this.keep(material);
  }

  private keep<T extends { dispose(): void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  private addLight(color: number, intensity: number, distance: number, at: THREE.Vector3) {
    const light = new THREE.PointLight(color, intensity, distance, 2);
    light.position.copy(at);
    this.group.add(light);
    this.lights.push({ light, base: intensity });
    return light;
  }

  private addHalo(
    at: THREE.Vector3,
    size: number,
    color: number,
    opacity: number,
    texture: THREE.Texture,
  ): THREE.Sprite {
    const material = this.keep(
      new THREE.SpriteMaterial({
        map: texture,
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(at);
    sprite.scale.setScalar(size);
    sprite.renderOrder = 20;
    this.group.add(sprite);
    return sprite;
  }

  // --- The fire ---------------------------------------------------------

  private buildFire(spot: THREE.Vector3, embers: THREE.Mesh | null, glow: THREE.Texture) {
    const flameTexture = this.keep(makeFlameTexture());
    const tongues: { sprite: THREE.Sprite; phase: number; x: number; z: number; h: number }[] = [];
    const layout = [
      [0, 0, 0.5],
      [-0.12, 0.03, 0.36],
      [0.13, -0.02, 0.38],
      [-0.05, -0.05, 0.3],
      [0.06, 0.05, 0.28],
      [-0.2, 0, 0.22],
      [0.2, 0.02, 0.24],
    ] as const;
    // The fire faces into the room: spread the tongues across the firebox
    // width (along z in this room — the fireplace is on the west wall).
    for (const [dz, dx, h] of layout) {
      const material = this.keep(
        new THREE.SpriteMaterial({
          map: flameTexture,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
          opacity: 0.95,
        }),
      );
      const sprite = new THREE.Sprite(material);
      sprite.center.set(0.5, 0.05);
      sprite.renderOrder = 21;
      this.group.add(sprite);
      tongues.push({ sprite, phase: Math.random() * 100, x: spot.x + dx, z: spot.z + dz, h });
    }
    const haze = this.addHalo(
      new THREE.Vector3(spot.x + 0.08, spot.y + 0.22, spot.z),
      1.1,
      0xff7a2e,
      0.5,
      glow,
    );

    // Light thrown into the room: just in front of the firebox, a little up.
    const light = this.addLight(
      0xff8a3c,
      7,
      9,
      new THREE.Vector3(spot.x + 0.45, spot.y + 0.45, spot.z),
    );
    const emberMaterial =
      embers?.material instanceof THREE.MeshStandardMaterial ? embers.material : null;
    // The ember bed as glowing coals — hot cracks between dark lumps —
    // rather than one flat, evenly lit sheet (which reads as pale sand).
    if (emberMaterial && embers?.geometry.getAttribute('uv')) {
      emberMaterial.emissiveMap = this.keep(makeCoalTexture());
      emberMaterial.emissive.setRGB(1, 0.36, 0.08);
      emberMaterial.emissiveIntensity = 2.4;
      emberMaterial.needsUpdate = true;
    }
    const emberBase = emberMaterial?.emissiveIntensity ?? 1;

    // Sparks: a handful of points rising and fading, respawning at the logs.
    const SPARKS = 36;
    const positions = new Float32Array(SPARKS * 3);
    const ages = new Float32Array(SPARKS);
    const lives = new Float32Array(SPARKS);
    const velocities = new Float32Array(SPARKS * 3);
    const respawn = (i: number) => {
      positions[i * 3] = spot.x + (Math.random() - 0.5) * 0.2;
      positions[i * 3 + 1] = spot.y + 0.1;
      positions[i * 3 + 2] = spot.z + (Math.random() - 0.5) * 0.5;
      velocities[i * 3] = (Math.random() - 0.2) * 0.12;
      velocities[i * 3 + 1] = 0.35 + Math.random() * 0.45;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.12;
      ages[i] = 0;
      lives[i] = 0.8 + Math.random() * 1.4;
    };
    for (let i = 0; i < SPARKS; i++) {
      respawn(i);
      ages[i] = Math.random() * lives[i]!;
    }
    const alphas = new Float32Array(SPARKS);
    const geometry = this.keep(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    const sparks = new THREE.Points(
      geometry,
      this.points(makePointsMaterial(glow, new THREE.Color(0xffa040), 0.035)),
    );
    sparks.frustumCulled = false;
    sparks.renderOrder = 22;
    this.group.add(sparks);

    this.updaters.push((dt, time) => {
      const flicker = this.reducedMotion
        ? 1
        : 0.82 +
          0.1 * Math.sin(time * 7.3) +
          0.08 * Math.sin(time * 13.1 + 1.3) +
          0.05 * Math.sin(time * 23.7);
      for (const tongue of tongues) {
        const t = time * 1.9 + tongue.phase;
        const wobble = this.reducedMotion ? 0 : Math.sin(t * 3.1) * 0.25 + Math.sin(t * 5.7) * 0.15;
        const height = tongue.h * (0.85 + 0.25 * (0.5 + 0.5 * Math.sin(t * 2.3)) + 0.1 * wobble);
        tongue.sprite.scale.set(height * 0.55, height, 1);
        tongue.sprite.position.set(tongue.x, spot.y - 0.02, tongue.z + wobble * 0.02);
        (tongue.sprite.material as THREE.SpriteMaterial).opacity = 0.75 + 0.2 * Math.sin(t * 4.1);
      }
      const dark = this.roomLightsOn ? 1 : 1.25;
      light.intensity = 7 * flicker * dark;
      (haze.material as THREE.SpriteMaterial).opacity = 0.42 * flicker;
      if (emberMaterial) emberMaterial.emissiveIntensity = emberBase * (0.75 + 0.35 * flicker);
      for (let i = 0; i < SPARKS; i++) {
        ages[i]! += dt;
        if (ages[i]! >= lives[i]!) respawn(i);
        positions[i * 3]! += velocities[i * 3]! * dt;
        positions[i * 3 + 1]! += velocities[i * 3 + 1]! * dt;
        positions[i * 3 + 2]! += (velocities[i * 3 + 2]! + Math.sin(time * 3 + i) * 0.05) * dt;
        const life = ages[i]! / lives[i]!;
        alphas[i] = Math.max(0, 1 - life) * (life < 0.1 ? life * 10 : 1);
      }
      geometry.attributes.position!.needsUpdate = true;
      geometry.attributes.alpha!.needsUpdate = true;
    });
  }

  // --- Candle and lamp flames ------------------------------------------

  private buildFlames(flames: THREE.Mesh[], glow: THREE.Texture) {
    const entries = flames.map((flame) => {
      // Unlit and bright, keeping the flame's own texture (and its alpha).
      const source = flame.material as THREE.MeshStandardMaterial;
      const material = this.keep(
        new THREE.MeshBasicMaterial({
          map: source.map ?? null,
          alphaMap: source.alphaMap ?? null,
          color: 0xffe2b0,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      );
      flame.material = material;
      const at = new THREE.Box3().setFromObject(flame).getCenter(new THREE.Vector3());
      const halo = this.addHalo(at, 0.16, 0xffa850, 0.55, glow);
      return { flame, halo, baseScale: flame.scale.clone(), phase: Math.random() * 100 };
    });

    // A few shared lights rather than one per flame (every light costs every
    // lit pixel): flames within ~2.5 m share one at their average position.
    const clusters: THREE.Vector3[][] = [];
    for (const { halo } of entries) {
      const near = clusters.find((cluster) => cluster[0]!.distanceTo(halo.position) < 2.6);
      if (near) near.push(halo.position);
      else clusters.push([halo.position]);
    }
    const candleLights = clusters.map((cluster) => {
      const center = cluster
        .reduce((sum, at) => sum.add(at), new THREE.Vector3())
        .divideScalar(cluster.length);
      // Wall candles' average position lies on the wall itself, where
      // inverse-square falloff paints a hard hotspot between the flames.
      // Pull the light ~half a metre off the wall, toward the room's middle.
      const inward = new THREE.Vector3(-center.x, 0, -center.z);
      if (inward.lengthSq() > 1e-6) {
        center.add(inward.normalize().multiplyScalar(0.55));
      }
      return this.addLight(
        0xffa24d,
        0.6 + 0.25 * Math.min(cluster.length, 6),
        4,
        center.add(new THREE.Vector3(0, 0.08, 0)),
      );
    });
    const lightBase = candleLights.map((light) => light.intensity);

    this.updaters.push((_dt, time) => {
      for (const entry of entries) {
        const t = time * 2.2 + entry.phase;
        const flicker = this.reducedMotion
          ? 1
          : 0.9 + 0.07 * Math.sin(t * 9.1) + 0.05 * Math.sin(t * 15.3);
        entry.flame.scale.set(
          entry.baseScale.x * (0.96 + 0.04 * Math.sin(t * 6.1)),
          entry.baseScale.y * flicker,
          entry.baseScale.z,
        );
        (entry.halo.material as THREE.SpriteMaterial).opacity = 0.5 * flicker;
      }
      candleLights.forEach((light, i) => {
        const wobble = this.reducedMotion ? 1 : 0.9 + 0.1 * Math.sin(time * 8.3 + i * 1.7);
        light.intensity = lightBase[i]! * wobble * (this.roomLightsOn ? 1 : 1.4);
      });
    });
  }

  // --- The chandelier's bulbs -------------------------------------------

  private buildChandelierGlow(chandelier: THREE.Object3D, glow: THREE.Texture) {
    chandelier.updateMatrixWorld(true);
    chandelier.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => {
        if (material instanceof THREE.MeshStandardMaterial && /lamp/i.test(material.name)) {
          // A dark body under a warm glow: lit by the room's lamps as well,
          // a white body blew out to flat white patches under the lantern.
          material.color.setRGB(0.22, 0.14, 0.07);
          material.emissive.setRGB(1, 0.62, 0.3);
          material.emissiveIntensity = 1.8;
        }
      });
    });
    // The halo hangs from the chandelier itself, so it hides along with it
    // (the top-down seated view hides the chandelier).
    const center = new THREE.Box3().setFromObject(chandelier).getCenter(new THREE.Vector3());
    const halo = this.addHalo(center, 0.9, 0xffb060, 0.35, glow);
    chandelier.attach(halo);
  }

  // --- Fairy lights along the beams ------------------------------------

  private buildFairyLights(beams: THREE.Box3[], glow: THREE.Texture) {
    const points: THREE.Vector3[] = [];
    const wires: THREE.Vector3[][] = [];
    for (const beam of beams) {
      const size = beam.getSize(new THREE.Vector3());
      const alongX = size.x >= size.z;
      const length = alongX ? size.x : size.z;
      if (length < 3) continue;
      const y = beam.min.y - 0.015;
      const fixed = alongX ? (beam.min.z + beam.max.z) / 2 : (beam.min.x + beam.max.x) / 2;
      const start = (alongX ? beam.min.x : beam.min.z) + 0.35;
      const end = (alongX ? beam.max.x : beam.max.z) - 0.35;
      // Draped in swags between hooks every ~1.2 m, bulbs every ~13 cm.
      const hooks = Math.max(2, Math.round((end - start) / 1.2));
      const wire: THREE.Vector3[] = [];
      for (let h = 0; h < hooks; h++) {
        const a = start + ((end - start) * h) / hooks;
        const b = start + ((end - start) * (h + 1)) / hooks;
        const bulbs = Math.round((b - a) / 0.13);
        for (let k = 0; k <= bulbs; k++) {
          const t = k / bulbs;
          const along = a + (b - a) * t;
          const sag = 0.16 * 4 * t * (1 - t);
          const at = alongX
            ? new THREE.Vector3(along, y - sag, fixed)
            : new THREE.Vector3(fixed, y - sag, along);
          wire.push(at);
          if (k > 0 && k < bulbs) points.push(at);
        }
      }
      wires.push(wire);
    }
    if (points.length === 0) return;

    const wireMaterial = this.keep(new THREE.LineBasicMaterial({ color: 0x2a2018 }));
    for (const wire of wires) {
      const geometry = this.keep(new THREE.BufferGeometry().setFromPoints(wire));
      this.group.add(new THREE.Line(geometry, wireMaterial));
    }

    const bulbGeometry = this.keep(new THREE.SphereGeometry(0.011, 8, 6));
    const bulbMaterial = this.keep(new THREE.MeshBasicMaterial({ toneMapped: false }));
    const bulbs = new THREE.InstancedMesh(bulbGeometry, bulbMaterial, points.length);
    const colors = [
      new THREE.Color(1, 0.86, 0.6),
      new THREE.Color(1, 0.72, 0.42),
      new THREE.Color(1, 0.93, 0.78),
    ];
    const matrix = new THREE.Matrix4();
    points.forEach((at, i) => {
      matrix.makeTranslation(at.x, at.y, at.z);
      bulbs.setMatrixAt(i, matrix);
      bulbs.setColorAt(i, colors[i % colors.length]!);
    });
    this.group.add(bulbs);

    const positions = new Float32Array(points.flatMap((at) => [at.x, at.y, at.z]));
    const alphas = new Float32Array(points.length);
    const phases = points.map(() => Math.random() * Math.PI * 2);
    const speeds = points.map(() => 0.6 + Math.random() * 1.4);
    const geometry = this.keep(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    const glows = new THREE.Points(
      geometry,
      this.points(makePointsMaterial(glow, new THREE.Color(1, 0.72, 0.4), 0.11)),
    );
    glows.renderOrder = 20;
    this.group.add(glows);
    this.updaters.push((_dt, time) => {
      for (let i = 0; i < alphas.length; i++) {
        alphas[i] = this.reducedMotion
          ? 0.6
          : 0.45 +
            0.25 * Math.sin(time * speeds[i]! + phases[i]!) +
            0.1 * Math.sin(time * 3.1 * speeds[i]!);
      }
      geometry.attributes.alpha!.needsUpdate = true;
    });
  }

  // --- The night outside the window ------------------------------------

  private buildWindow(pane: THREE.Mesh) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 900;
    const texture = this.keep(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    pane.material = this.keep(new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    const stars = Array.from({ length: 170 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height * 0.72,
      r: Math.random() < 0.08 ? 1.9 : 0.6 + Math.random() * 1.1,
      phase: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 2,
    }));
    const hills = makeHills(canvas.width);
    const paint = (time: number) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const { width: w, height: h } = canvas;
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#060a1c');
      sky.addColorStop(0.55, '#0f1a3a');
      sky.addColorStop(0.85, '#22305a');
      sky.addColorStop(1, '#2b3560');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      for (const star of stars) {
        const twinkle = this.reducedMotion
          ? 0.8
          : 0.55 + 0.45 * Math.sin(time * star.speed + star.phase);
        ctx.globalAlpha = twinkle;
        ctx.fillStyle = '#fff6e0';
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // The moon, with a soft halo.
      const mx = w * 0.72;
      const my = h * 0.24;
      const halo = ctx.createRadialGradient(mx, my, 20, mx, my, 190);
      halo.addColorStop(0, 'rgba(255, 244, 214, 0.35)');
      halo.addColorStop(1, 'rgba(255, 244, 214, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(mx - 200, my - 200, 400, 400);
      ctx.fillStyle = '#fbf1d6';
      ctx.beginPath();
      ctx.arc(mx, my, 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(200, 188, 160, 0.35)';
      for (const [dx, dy, r] of [
        [-12, -8, 9],
        [14, 10, 6],
        [4, -18, 5],
      ] as const) {
        ctx.beginPath();
        ctx.arc(mx + dx, my + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Rolling hills and a few pines against the sky.
      ctx.fillStyle = '#0a0f1f';
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (const [x, y] of hills) ctx.lineTo(x, h - y);
      ctx.lineTo(w, h);
      ctx.fill();
      texture.needsUpdate = true;
    };
    paint(0);
    let sinceRepaint = 0;
    this.updaters.push((dt, time) => {
      sinceRepaint += dt;
      if (sinceRepaint > 0.35 && !this.reducedMotion) {
        sinceRepaint = 0;
        paint(time);
      }
    });
  }

  // --- Dust in the lamplight -------------------------------------------

  private buildDust(room: RoomAsset) {
    const { bounds, wallHeight } = room.layout;
    const COUNT = 260;
    const positions = new Float32Array(COUNT * 3);
    const base = new Float32Array(COUNT * 3);
    const alphas = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      base[i * 3] = bounds.minX + 0.3 + Math.random() * (bounds.maxX - bounds.minX - 0.6);
      base[i * 3 + 1] = 0.3 + Math.random() * (wallHeight - 0.6);
      base[i * 3 + 2] = bounds.minZ + 0.3 + Math.random() * (bounds.maxZ - bounds.minZ - 0.6);
      alphas[i] = 0.2 + Math.random() * 0.35;
    }
    positions.set(base);
    const geometry = this.keep(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    const glow = this.keep(makeGlowTexture());
    const dust = new THREE.Points(
      geometry,
      this.points(makePointsMaterial(glow, new THREE.Color(1, 0.88, 0.7), 0.018)),
    );
    dust.frustumCulled = false;
    this.group.add(dust);
    if (this.reducedMotion) return;
    this.updaters.push((_dt, time) => {
      for (let i = 0; i < COUNT; i++) {
        const t = time * 0.05 + i * 1.7;
        positions[i * 3] = base[i * 3]! + Math.sin(t) * 0.25;
        positions[i * 3 + 1] = base[i * 3 + 1]! + Math.sin(t * 0.7 + i) * 0.15;
        positions[i * 3 + 2] = base[i * 3 + 2]! + Math.cos(t * 0.8) * 0.25;
      }
      geometry.attributes.position!.needsUpdate = true;
    });
  }
}

/** A soft white radial gradient — tinted per use, drawn additively. */
function makeGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A single tongue of flame: white-yellow core, orange body, red edges. */
function makeFlameTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.translate(32, 124);
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-30, -10, -22, -70, 0, -122);
      ctx.bezierCurveTo(22, -70, 30, -10, 0, 0);
      ctx.closePath();
    };
    const outer = ctx.createLinearGradient(0, 0, 0, -122);
    outer.addColorStop(0, 'rgba(255, 110, 20, 0.9)');
    outer.addColorStop(0.6, 'rgba(230, 70, 15, 0.55)');
    outer.addColorStop(1, 'rgba(160, 30, 10, 0)');
    ctx.fillStyle = outer;
    shape();
    ctx.fill();
    ctx.scale(0.55, 0.62);
    const inner = ctx.createLinearGradient(0, 0, 0, -122);
    inner.addColorStop(0, 'rgba(255, 245, 200, 1)');
    inner.addColorStop(0.5, 'rgba(255, 200, 90, 0.8)');
    inner.addColorStop(1, 'rgba(255, 150, 40, 0)');
    ctx.fillStyle = inner;
    shape();
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Glowing coals: dark lumps with hot orange cracks and a few bright
 * spots between them — the ember bed's emissive map. */
function makeCoalTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#3a0c02';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const radius = 10 + Math.random() * 30;
      const heat = Math.random();
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, heat > 0.75 ? 'rgba(255, 214, 120, 0.9)' : 'rgba(255, 120, 30, 0.7)');
      glow.addColorStop(1, 'rgba(255, 90, 20, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    // Dark coal lumps over the glow; the gaps between them stay hot.
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const radius = 8 + Math.random() * 16;
      ctx.fillStyle = `rgba(8, 3, 1, ${0.55 + Math.random() * 0.35})`;
      ctx.beginPath();
      for (let corner = 0; corner < 7; corner++) {
        const angle = (corner / 7) * Math.PI * 2;
        const reach = radius * (0.7 + Math.random() * 0.3);
        const px = x + Math.cos(angle) * reach;
        const py = y + Math.sin(angle) * reach;
        if (corner === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Additive, size-attenuated points with a per-point `alpha` attribute. */
function makePointsMaterial(
  texture: THREE.Texture,
  color: THREE.Color,
  size: number,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      color: { value: color },
      size: { value: size },
      scale: { value: 800 },
    },
    vertexShader: /* glsl */ `
      attribute float alpha;
      uniform float size;
      uniform float scale;
      varying float vAlpha;
      void main() {
        vAlpha = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * scale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 color;
      varying float vAlpha;
      void main() {
        vec4 t = texture2D(map, gl_PointCoord);
        gl_FragColor = vec4(color * t.rgb, t.a * vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** Two layers of rolling hills with a few pine silhouettes. */
function makeHills(width: number): [number, number][] {
  const out: [number, number][] = [];
  for (let x = 0; x <= width; x += 8) {
    let y = 120 + 40 * Math.sin(x / 170) + 22 * Math.sin(x / 61 + 1.3);
    // Pines: sharp spikes here and there.
    const pine = Math.abs(((x + 37) % 97) - 48);
    if (x % 3 === 0 && pine < 14) y += (14 - pine) * 4.5;
    out.push([x, y]);
  }
  return out;
}
