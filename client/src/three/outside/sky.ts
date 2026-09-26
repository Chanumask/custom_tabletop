import * as THREE from 'three';
import { seededRandom } from '../parchment.js';
import { MOON_DIRECTION } from './terrain.js';
import type { Kit, OutsideTheme, Piece } from './kit.js';
import type { Weather } from '@custom-tabletop/shared';

/** The sky, clouds and moon sit this far out and move with the viewer —
 * as good as infinitely far away. */
const SKY_RADIUS = 1500;
const MOON_DISTANCE = 1200;
const CLOUD_DISTANCE = 1000;

export interface SkyPalette {
  zenith: THREE.Color;
  horizon: THREE.Color;
  /** A band low on the horizon (Halloween's ember glow). */
  low: THREE.Color;
  /** The light around the moon. */
  moonGlow: THREE.Color;
  stars: number;
}

export const SKY_PALETTES: Record<OutsideTheme, SkyPalette> = {
  classic: {
    zenith: new THREE.Color('#040a1e'),
    horizon: new THREE.Color('#2a3b6c'),
    low: new THREE.Color('#34467a'),
    moonGlow: new THREE.Color('#5068a8'),
    stars: 1,
  },
  halloween: {
    zenith: new THREE.Color('#0a0418'),
    horizon: new THREE.Color('#3a1c48'),
    low: new THREE.Color('#8a3a14'),
    moonGlow: new THREE.Color('#a8501c'),
    stars: 0.7,
  },
  // A clear, cold winter night: the snow lights the horizon from below.
  winter: {
    zenith: new THREE.Color('#050c20'),
    horizon: new THREE.Color('#3a4a70'),
    low: new THREE.Color('#5a6a92'),
    moonGlow: new THREE.Color('#7088c8'),
    stars: 1.15,
  },
};

/** How grey the sky goes under the weather's clouds (0 clear, 1 overcast). */
const OVERCAST: Record<Weather, { cover: number; color: string }> = {
  clear: { cover: 0, color: '#1c2232' },
  rain: { cover: 0.85, color: '#1b2130' },
  storm: { cover: 1, color: '#10141e' },
  snow: { cover: 0.8, color: '#2e3548' },
};

const moonDirection = new THREE.Vector3(MOON_DIRECTION.x, MOON_DIRECTION.y, MOON_DIRECTION.z);

/** The night sky: a gradient dome with twinkling stars and a faint milky
 * way, the moon with its halo, drifting clouds and the odd shooting star. */
export function buildSky(kit: Kit): Piece & {
  palette: () => SkyPalette;
  /** How much of the sky the weather's clouds cover (0..1), eased. */
  overcast: () => number;
  /** Lightning lighting the clouds from inside (0..1), set each frame. */
  setFlash: (amount: number) => void;
} {
  const group = new THREE.Group();
  group.name = 'sky';
  let palette = SKY_PALETTES.classic;

  const uniforms = {
    uZenith: { value: palette.zenith.clone() },
    uHorizon: { value: palette.horizon.clone() },
    uLow: { value: palette.low.clone() },
    uGlow: { value: palette.moonGlow.clone() },
    uMoonDir: { value: moonDirection },
    uTime: { value: 0 },
    uStars: { value: palette.stars },
    uOvercast: { value: 0 },
    uCloud: { value: new THREE.Color(OVERCAST.clear.color) },
    uFlash: { value: 0 },
  };
  let overcastTarget = 0;
  const cloudTarget = new THREE.Color(OVERCAST.clear.color);
  const dome = new THREE.Mesh(
    kit.keep(new THREE.SphereGeometry(SKY_RADIUS, 48, 24)),
    kit.keep(
      new THREE.ShaderMaterial({
        uniforms,
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uZenith;
          uniform vec3 uHorizon;
          uniform vec3 uLow;
          uniform vec3 uGlow;
          uniform vec3 uMoonDir;
          uniform float uTime;
          uniform float uStars;
          uniform float uOvercast;
          uniform vec3 uCloud;
          uniform float uFlash;
          varying vec3 vDir;

          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                       mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
          }

          void main() {
            vec3 d = normalize(vDir);
            float up = clamp(d.y, -0.3, 1.0);
            vec3 color = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.62, up), 0.75));
            color = mix(color, uLow, (1.0 - smoothstep(-0.01, 0.09, up)) * 0.8);
            float moon = max(dot(d, uMoonDir), 0.0);
            color += uGlow * (pow(moon, 10.0) * 0.55 + pow(moon, 90.0) * 0.9);

            // Stars: one per lucky cell, each twinkling at its own pace.
            vec2 sphere = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0)));
            vec2 grid = sphere * 230.0;
            vec2 cell = floor(grid);
            float luck = hash(cell);
            vec2 offset = vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5;
            float dist = length(fract(grid) - 0.5 - offset * 0.5);
            float star = step(0.982, luck) * smoothstep(0.34, 0.0, dist);
            float bright = (luck - 0.982) / 0.018;
            float twinkle = 0.55 + 0.45 * sin(uTime * (0.8 + luck * 3.0) + luck * 60.0);
            star *= (0.25 + 2.2 * bright * bright) * twinkle;
            float fade = smoothstep(0.03, 0.22, d.y) * (1.0 - smoothstep(0.93, 0.998, moon));
            // A faint milky way arching over from the south-west.
            float band = exp(-pow(dot(d, normalize(vec3(0.62, 0.35, 0.7))) * 4.2, 2.0));
            float dust = noise(sphere * 9.0) * 0.6 + noise(sphere * 23.0) * 0.4;
            color += vec3(0.07, 0.08, 0.12) * band * dust * fade * uStars;
            star += step(0.9, noise(sphere * 160.0)) * band * 0.25;
            color += vec3(1.0, 0.95, 0.88) * star * fade * uStars * (1.0 - uOvercast);
            // The weather's clouds: a low grey ceiling, lumpy and slowly moving,
            // lit from inside when lightning strikes.
            float lumps = noise(sphere * 6.0 + vec2(uTime * 0.01, 0.0)) * 0.6
              + noise(sphere * 17.0 - vec2(uTime * 0.02, 0.0)) * 0.4;
            vec3 ceiling = uCloud * (0.75 + 0.5 * lumps) * mix(1.25, 0.8, smoothstep(0.0, 0.6, up));
            color = mix(color, ceiling, uOvercast * smoothstep(-0.2, 0.05, up));
            color += vec3(0.62, 0.68, 0.85) * uFlash * (0.5 + 0.8 * lumps) * smoothstep(-0.1, 0.3, up);
            gl_FragColor = vec4(color, 1.0);
          }
        `,
      }),
    ),
  );
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  group.add(dome);

  // The moon: a lit disc with maria and craters, and a wide soft halo.
  const moonTexture = kit.canvasTexture(256, 256, (ctx) => {
    const random = seededRandom(0x3007);
    const disc = ctx.createRadialGradient(118, 116, 20, 128, 128, 118);
    disc.addColorStop(0, '#fffaf0');
    disc.addColorStop(0.75, '#efe6d2');
    disc.addColorStop(1, '#cfc4ad');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(128, 128, 118, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.clip();
    for (const [x, y, r] of [
      [96, 100, 38],
      [150, 86, 26],
      [160, 150, 34],
      [104, 168, 22],
    ] as const) {
      ctx.fillStyle = 'rgba(150, 140, 125, 0.33)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 26; i += 1) {
      const x = 30 + random() * 196;
      const y = 30 + random() * 196;
      const r = 2 + random() * 7;
      ctx.strokeStyle = 'rgba(120, 110, 95, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  });
  const moonMaterial = kit.keep(
    new THREE.SpriteMaterial({ map: moonTexture, fog: false, depthWrite: false }),
  );
  const moon = new THREE.Sprite(moonMaterial);
  moon.renderOrder = -9;
  const glowTexture = kit.glow();
  const moonHalo = kit.halo(glowTexture, '#c9d6ff', 1, 0.5);
  moonHalo.renderOrder = -9;
  group.add(moonHalo, moon);

  // Clouds: soft dark banks with moonlit edges, drifting slowly.
  const cloudTexture = kit.canvasTexture(512, 192, (ctx) => {
    const random = seededRandom(0xc10d);
    for (let i = 0; i < 38; i += 1) {
      const x = 60 + random() * 392;
      const y = 70 + random() * 70 - Math.abs(x - 256) * 0.12;
      const r = 26 + random() * 46;
      const puff = ctx.createRadialGradient(x, y - r * 0.25, 0, x, y, r);
      puff.addColorStop(0, 'rgba(210, 220, 245, 0.55)');
      puff.addColorStop(0.5, 'rgba(120, 130, 160, 0.35)');
      puff.addColorStop(1, 'rgba(60, 66, 90, 0)');
      ctx.fillStyle = puff;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const cloudRandom = seededRandom(0xc1a0);
  const clouds = Array.from({ length: 9 }, (_, index) => {
    const material = kit.keep(
      new THREE.SpriteMaterial({
        map: cloudTexture,
        color: '#5a6485',
        transparent: true,
        opacity: 0.55 + cloudRandom() * 0.3,
        fog: false,
        depthWrite: false,
      }),
    );
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = -8;
    const width = 260 + cloudRandom() * 280;
    sprite.scale.set(width, width * 0.32, 1);
    group.add(sprite);
    // The first few drift near the moon, the rest anywhere.
    const nearMoon = index < 3;
    const moonAzimuth = Math.atan2(moonDirection.z, moonDirection.x);
    return {
      sprite,
      azimuth: nearMoon ? moonAzimuth - 0.5 - index * 0.35 : cloudRandom() * Math.PI * 2,
      elevation: nearMoon ? 0.16 + index * 0.06 : 0.08 + cloudRandom() * 0.35,
      speed: 0.004 + cloudRandom() * 0.004,
    };
  });

  // Shooting stars: a bright head with a fading tail, now and then.
  const trail = new THREE.BufferGeometry();
  const trailPositions = new Float32Array(6);
  trail.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  trail.setAttribute(
    'color',
    new THREE.BufferAttribute(new Float32Array([2.2, 2.1, 1.9, 0, 0, 0]), 3),
  );
  kit.keep(trail);
  const trailMaterial = kit.keep(
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  const shootingStar = new THREE.Line(trail, trailMaterial);
  shootingStar.frustumCulled = false;
  shootingStar.visible = false;
  shootingStar.renderOrder = -8;
  group.add(shootingStar);
  const meteorRandom = seededRandom(0x5a7);
  let nextMeteor = 6 + meteorRandom() * 10;
  let meteor: { from: THREE.Vector3; to: THREE.Vector3; age: number; life: number } | null = null;

  const placeMoon = (theme: OutsideTheme) => {
    const size = theme === 'halloween' ? 64 : 42;
    moon.position.copy(moonDirection).multiplyScalar(MOON_DISTANCE);
    moon.scale.set(size, size, 1);
    moonHalo.position.copy(moon.position);
    moonHalo.scale.set(size * 7, size * 7, 1);
    moonMaterial.color.set(theme === 'halloween' ? '#ffb070' : '#fff6e6').multiplyScalar(1.6);
    moonHalo.material.color.set(theme === 'halloween' ? '#ff9a50' : '#b9c8ff');
    moonHalo.material.opacity = theme === 'halloween' ? 0.5 : 0.35;
  };
  placeMoon('classic');

  return {
    object: group,
    palette: () => palette,
    overcast: () => uniforms.uOvercast.value,
    setFlash(amount) {
      uniforms.uFlash.value = amount;
    },
    setWeather(weather) {
      overcastTarget = OVERCAST[weather].cover;
      cloudTarget.set(OVERCAST[weather].color);
    },
    setTheme(theme) {
      palette = SKY_PALETTES[theme];
      uniforms.uZenith.value.copy(palette.zenith);
      uniforms.uHorizon.value.copy(palette.horizon);
      uniforms.uLow.value.copy(palette.low);
      uniforms.uGlow.value.copy(palette.moonGlow);
      uniforms.uStars.value = palette.stars;
      placeMoon(theme);
      for (const cloud of clouds) {
        cloud.sprite.material.color.set(theme === 'halloween' ? '#4a3858' : '#5a6485');
      }
    },
    update(dt, time, camera) {
      group.position.copy(camera.position);
      uniforms.uTime.value = time;
      // Clouds roll in (and clear away) over several seconds.
      const ease = Math.min(1, dt * 0.35);
      uniforms.uOvercast.value += (overcastTarget - uniforms.uOvercast.value) * ease;
      uniforms.uCloud.value.lerp(cloudTarget, ease);
      const clear = 1 - uniforms.uOvercast.value;
      moon.visible = clear > 0.05;
      moonHalo.visible = moon.visible;
      moonMaterial.opacity = clear;
      moonMaterial.transparent = clear < 1;
      const drift = kit.reducedMotion ? 0 : dt;
      for (const cloud of clouds) {
        cloud.azimuth += cloud.speed * drift;
        const flat = Math.cos(cloud.elevation) * CLOUD_DISTANCE;
        cloud.sprite.position.set(
          Math.cos(cloud.azimuth) * flat,
          Math.sin(cloud.elevation) * CLOUD_DISTANCE,
          Math.sin(cloud.azimuth) * flat,
        );
      }
      if (kit.reducedMotion) return;
      if (!meteor) {
        nextMeteor -= dt;
        if (nextMeteor <= 0) {
          nextMeteor = 18 + meteorRandom() * 30;
          const azimuth = meteorRandom() * Math.PI * 2;
          const from = new THREE.Vector3(
            Math.cos(azimuth),
            0.3 + meteorRandom() * 0.35,
            Math.sin(azimuth),
          )
            .normalize()
            .multiplyScalar(MOON_DISTANCE);
          const to = from
            .clone()
            .add(
              new THREE.Vector3(
                -Math.sin(azimuth) * 320,
                -140 - meteorRandom() * 120,
                Math.cos(azimuth) * 320,
              ).multiplyScalar(meteorRandom() < 0.5 ? 1 : -1),
            );
          to.y = Math.min(to.y, from.y - 120);
          meteor = { from, to, age: 0, life: 0.9 + meteorRandom() * 0.5 };
        }
      }
      if (meteor) {
        meteor.age += dt;
        const t = meteor.age / meteor.life;
        if (t >= 1) {
          meteor = null;
          shootingStar.visible = false;
        } else {
          const head = meteor.from.clone().lerp(meteor.to, t);
          const tail = meteor.from.clone().lerp(meteor.to, Math.max(0, t - 0.28));
          head.toArray(trailPositions, 0);
          tail.toArray(trailPositions, 3);
          trail.attributes.position!.needsUpdate = true;
          trailMaterial.opacity = Math.sin(t * Math.PI);
          shootingStar.visible = true;
        }
      }
    },
  };
}
