import * as THREE from 'three';

import type { Weather } from '@custom-tabletop/shared';

/** Which world is outside the windows (docs/decisions.md, "The world outside"). */
export type OutsideTheme = 'classic' | 'halloween' | 'winter';

/** A part of the world outside: its objects, and what it does each frame. */
export interface Piece {
  object: THREE.Object3D;
  /** `camera` is where the player looks from (sky parts follow it). */
  update?: (dt: number, time: number, camera: THREE.Camera) => void;
  setTheme?: (theme: OutsideTheme) => void;
  /** The host's weather (room.ts): rain, a storm, snow, or clear skies. */
  setWeather?: (weather: Weather) => void;
}

/** Collects everything GPU-side a piece makes, so the world disposes in one go. */
export class Kit {
  private readonly items: { dispose(): void }[] = [];
  /** Screen pixels per metre at 1 m away — glowing points size by it (set
   * each frame from the outside view's height and field of view). */
  readonly pointScale = { value: 400 };

  constructor(readonly reducedMotion: boolean) {}

  keep<T extends { dispose(): void }>(item: T): T {
    this.items.push(item);
    return item;
  }

  canvasTexture(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) paint(ctx);
    const texture = this.keep(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /** A soft white radial glow — tinted per use, drawn additively. */
  glow(): THREE.CanvasTexture {
    return this.canvasTexture(64, 64, (ctx) => {
      const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.22, 'rgba(255,255,255,0.55)');
      gradient.addColorStop(0.55, 'rgba(255,255,255,0.12)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
    });
  }

  /** An additive glow sprite (a lantern's halo, a firefly...). */
  halo(texture: THREE.Texture, color: THREE.ColorRepresentation, size: number, opacity = 1) {
    const sprite = new THREE.Sprite(
      this.keep(
        new THREE.SpriteMaterial({
          map: texture,
          color,
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
        }),
      ),
    );
    sprite.scale.set(size, size, 1);
    return sprite;
  }

  dispose(): void {
    this.items.forEach((item) => item.dispose());
    this.items.length = 0;
  }
}

/** Glowing points with a per-point alpha (fireflies, embers, village smoke). */
export function glowPointsMaterial(
  texture: THREE.Texture,
  color: THREE.Color,
  size: number,
  scale: { value: number },
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      color: { value: color },
      size: { value: size },
      scale,
    },
    vertexShader: /* glsl */ `
      attribute float alpha;
      uniform float size;
      uniform float scale;
      varying float vAlpha;
      void main() {
        vAlpha = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // Capped, so one drifting right past the glass stays a speck.
        gl_PointSize = min(size * scale / -mv.z, 18.0);
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
