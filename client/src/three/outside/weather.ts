import * as THREE from 'three';
import type { Weather } from '@custom-tabletop/shared';
import { seededRandom } from '../parchment.js';
import type { Kit, Piece } from './kit.js';

/** Rain and snow fall in a box this wide around the viewer, this high. */
const SPREAD = 26;
const HEIGHT = 16;
const DROPS = 3200;
const FLAKES = 2600;
/** The house: nothing falls inside it (it would show up on the panes). */
const HOUSE = { x: 5.4, z: 4.4 };

/** Seconds between lightning strikes in a storm. */
const STRIKE_EVERY: [number, number] = [9, 24];

export interface WeatherPiece extends Piece {
  /** How bright the sky is lit by lightning right now (0..1). */
  flash: () => number;
}

/**
 * The weather outside (docs/decisions.md, "The cozy room, lived in"): rain streaks
 * (heavier in a storm, with lightning), or snow drifting down. Both are
 * GPU-driven — every drop's fall is computed in its vertex shader from the
 * time, so thousands cost nothing per frame on the CPU. `onThunder` is
 * called a moment after each strike (sound travels slower than light).
 */
export function buildWeather(
  kit: Kit,
  onThunder: (loudness: number, delaySeconds: number) => void,
): WeatherPiece {
  const group = new THREE.Group();
  group.name = 'weather';
  const random = seededRandom(0x7a17);
  const center = { value: new THREE.Vector3() };
  const time = { value: 0 };

  // --- Rain: short streaks, slanted by the wind ---------------------------
  const rainAmount = { value: 0 };
  const rainSpeed = { value: 11 };
  const rainPositions = new Float32Array(DROPS * 2 * 3);
  const rainSeeds = new Float32Array(DROPS * 2);
  const rainEnds = new Float32Array(DROPS * 2);
  for (let i = 0; i < DROPS; i++) {
    const x = (random() - 0.5) * SPREAD * 2;
    const y = random() * HEIGHT;
    const z = (random() - 0.5) * SPREAD * 2;
    const seed = random();
    for (let end = 0; end < 2; end++) {
      const v = i * 2 + end;
      rainPositions.set([x, y, z], v * 3);
      rainSeeds[v] = seed;
      rainEnds[v] = end;
    }
  }
  const rainGeometry = kit.keep(new THREE.BufferGeometry());
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  rainGeometry.setAttribute('seed', new THREE.BufferAttribute(rainSeeds, 1));
  rainGeometry.setAttribute('end', new THREE.BufferAttribute(rainEnds, 1));
  const rainMaterial = kit.keep(
    new THREE.ShaderMaterial({
      uniforms: {
        uCenter: center,
        uTime: time,
        uAmount: rainAmount,
        uSpeed: rainSpeed,
        uFlash: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute float seed;
        attribute float end;
        uniform vec3 uCenter;
        uniform float uTime;
        uniform float uAmount;
        uniform float uSpeed;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          p.x = uCenter.x + mod(p.x - uCenter.x + ${SPREAD.toFixed(1)}, ${(SPREAD * 2).toFixed(1)}) - ${SPREAD.toFixed(1)};
          p.z = uCenter.z + mod(p.z - uCenter.z + ${SPREAD.toFixed(1)}, ${(SPREAD * 2).toFixed(1)}) - ${SPREAD.toFixed(1)};
          float fall = uSpeed * (0.85 + 0.3 * seed);
          p.y = mod(p.y - uTime * fall, ${HEIGHT.toFixed(1)}) - 1.0;
          // A streak's top end trails up and against the wind.
          p += end * vec3(-0.06, 0.45, 0.02) * (uSpeed / 11.0);
          bool inside = abs(p.x) < ${HOUSE.x.toFixed(1)} && abs(p.z) < ${HOUSE.z.toFixed(1)};
          vAlpha = (seed < uAmount && !inside) ? 1.0 : 0.0;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uFlash;
        varying float vAlpha;
        void main() {
          if (vAlpha < 0.5) discard;
          gl_FragColor = vec4(mix(vec3(0.62, 0.68, 0.8), vec3(1.0), uFlash), 0.32 + 0.4 * uFlash);
        }
      `,
      transparent: true,
      depthWrite: false,
      fog: false,
    }),
  );
  const rain = new THREE.LineSegments(rainGeometry, rainMaterial);
  rain.frustumCulled = false;
  group.add(rain);

  // --- Snow: soft flakes, drifting and swaying ---------------------------
  const snowAmount = { value: 0 };
  const flakePositions = new Float32Array(FLAKES * 3);
  const flakeSeeds = new Float32Array(FLAKES);
  for (let i = 0; i < FLAKES; i++) {
    flakePositions.set(
      [(random() - 0.5) * SPREAD * 2, random() * HEIGHT, (random() - 0.5) * SPREAD * 2],
      i * 3,
    );
    flakeSeeds[i] = random();
  }
  const snowGeometry = kit.keep(new THREE.BufferGeometry());
  snowGeometry.setAttribute('position', new THREE.BufferAttribute(flakePositions, 3));
  snowGeometry.setAttribute('seed', new THREE.BufferAttribute(flakeSeeds, 1));
  const snowMaterial = kit.keep(
    new THREE.ShaderMaterial({
      uniforms: {
        uCenter: center,
        uTime: time,
        uAmount: snowAmount,
        uMap: { value: kit.glow() },
        uScale: kit.pointScale,
      },
      vertexShader: /* glsl */ `
        attribute float seed;
        uniform vec3 uCenter;
        uniform float uTime;
        uniform float uAmount;
        uniform float uScale;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          float t = uTime * (0.6 + 0.4 * seed);
          p.x += sin(t * 0.9 + seed * 40.0) * 0.6 + uTime * 0.25;
          p.z += cos(t * 0.7 + seed * 23.0) * 0.6;
          p.x = uCenter.x + mod(p.x - uCenter.x + ${SPREAD.toFixed(1)}, ${(SPREAD * 2).toFixed(1)}) - ${SPREAD.toFixed(1)};
          p.z = uCenter.z + mod(p.z - uCenter.z + ${SPREAD.toFixed(1)}, ${(SPREAD * 2).toFixed(1)}) - ${SPREAD.toFixed(1)};
          p.y = mod(p.y - uTime * (0.7 + 0.5 * seed), ${HEIGHT.toFixed(1)}) - 1.0;
          bool inside = abs(p.x) < ${HOUSE.x.toFixed(1)} && abs(p.z) < ${HOUSE.z.toFixed(1)};
          vAlpha = (seed < uAmount && !inside) ? 0.9 : 0.0;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_PointSize = min(0.09 * (0.7 + seed) * uScale / -mv.z, 14.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying float vAlpha;
        void main() {
          if (vAlpha < 0.01) discard;
          float a = texture2D(uMap, gl_PointCoord).a;
          gl_FragColor = vec4(vec3(0.95, 0.97, 1.0), a * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      fog: false,
    }),
  );
  const snow = new THREE.Points(snowGeometry, snowMaterial);
  snow.frustumCulled = false;
  group.add(snow);

  // --- Lightning ----------------------------------------------------------
  let weather: Weather = 'clear';
  const target = { rain: 0, snow: 0 };
  let nextStrike = 4;
  /** The strike's flicker: a few bright pulses over half a second. */
  let strike: { age: number; pulses: number[] } | null = null;
  let flash = 0;
  const strikeRandom = seededRandom(0x5711);

  return {
    object: group,
    flash: () => flash,
    setWeather(next) {
      weather = next;
      target.rain = next === 'rain' ? 0.55 : next === 'storm' ? 1 : 0;
      target.snow = next === 'snow' ? 0.85 : 0;
      rainSpeed.value = next === 'storm' ? 15 : 11;
    },
    update(dt, elapsed, camera) {
      time.value = kit.reducedMotion ? 0 : elapsed;
      center.value.copy(camera.position);
      // The weather comes in (and goes) over several seconds.
      const ease = Math.min(1, dt * 0.35);
      rainAmount.value += (target.rain - rainAmount.value) * ease;
      snowAmount.value += (target.snow - snowAmount.value) * ease;
      rain.visible = rainAmount.value > 0.01;
      snow.visible = snowAmount.value > 0.01;

      if (weather === 'storm' && !strike) {
        nextStrike -= dt;
        if (nextStrike <= 0) {
          nextStrike = STRIKE_EVERY[0] + strikeRandom() * (STRIKE_EVERY[1] - STRIKE_EVERY[0]);
          const pulses = [0, 0.09 + strikeRandom() * 0.05, 0.22 + strikeRandom() * 0.12];
          strike = { age: 0, pulses };
          const near = strikeRandom();
          // Nearer strikes: brighter, louder, and the thunder comes sooner.
          onThunder(0.45 + 0.55 * near, 0.6 + (1 - near) * 3.2);
        }
      }
      flash = 0;
      if (strike) {
        strike.age += dt;
        for (const at of strike.pulses) {
          const since = strike.age - at;
          if (since >= 0) flash = Math.max(flash, Math.exp(-since * 16));
        }
        if (strike.age > 0.9) strike = null;
      }
      rainMaterial.uniforms.uFlash!.value = flash;
    },
  };
}
