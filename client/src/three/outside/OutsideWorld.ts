import * as THREE from 'three';
import type { Weather } from '@custom-tabletop/shared';
import { Kit, type OutsideTheme, type Piece } from './kit.js';
import { buildSky } from './sky.js';
import { buildLandscape } from './landscape.js';
import { buildFallingLeaves, buildFireflies } from './life.js';
import { buildHalloween } from './halloween.js';
import { buildWeather, type WeatherPiece } from './weather.js';
import { coverWithSnow } from './snowCover.js';
import { MOON_DIRECTION } from './terrain.js';

/** The outside is rendered at this fraction of the screen's resolution —
 * seen through old glass, a little softness is right, and it's cheaper. */
const RESOLUTION_SCALE = 0.6;
/** How far the outside camera sees (the room's own camera stops at 100 m). */
const FAR = 2000;

const FOG: Record<OutsideTheme, { density: number }> = {
  classic: { density: 0.0055 },
  halloween: { density: 0.0095 },
  winter: { density: 0.0065 },
};
/** The weather thickens the air: rain and snow hide the far hills. */
const WEATHER_FOG: Record<Weather, number> = { clear: 0, rain: 0.006, storm: 0.01, snow: 0.009 };
/** How much snow lies outside: a winter night is white; a snowfall on an
 * ordinary night settles slowly into a light cover. */
function snowTarget(theme: OutsideTheme, weather: Weather): number {
  if (theme === 'winter') return 1;
  return weather === 'snow' ? 0.6 : 0;
}

/**
 * The world outside the windows (docs/decisions.md, "The world outside"): a
 * whole night landscape in its own scene — sky, moon, lake, woods, a village
 * on a hill, fireflies, falling leaves — seen through every window pane as
 * if the walls had real holes in them. The host's theme dresses it (Halloween,
 * a snowy winter) and the host's weather rains, storms or snows on it.
 *
 * How: each frame a window is on screen, the outside is rendered from the
 * player's own camera into a texture (scissored to the panes), and each pane
 * shows that texture at its own screen position. So what's behind a window
 * has true perspective and parallax — walk past one and the lamp post slides
 * against the hills — without cutting the room's walls open. Each pane has
 * its own material: rain runs down a shut one; an open one is clear.
 */
export class OutsideWorld {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera();
  private readonly kit: Kit;
  private readonly pieces: Piece[];
  private readonly target: THREE.WebGLRenderTarget;
  private readonly panes: { mesh: THREE.Mesh; material: THREE.ShaderMaterial; box: THREE.Box3 }[];
  private readonly frustum = new THREE.Frustum();
  private readonly projection = new THREE.Matrix4();
  private readonly drawingBuffer = new THREE.Vector2();
  private readonly fog = new THREE.FogExp2(0x000000, FOG.classic.density);
  private readonly moonlight: THREE.DirectionalLight;
  private readonly skyLight: THREE.HemisphereLight;
  private readonly sky: ReturnType<typeof buildSky>;
  private readonly weatherPiece: WeatherPiece;
  private readonly snow = { value: 0 };
  private readonly time = { value: 0 };
  /** How rainy the glass is (0..1), eased as rain comes and goes. */
  private readonly glassRain = { value: 0 };
  private theme: OutsideTheme = 'classic';
  private weather: Weather = 'clear';
  private flashAllowed = true;
  private formatChecked = false;

  constructor(
    panes: THREE.Mesh[],
    reducedMotion = false,
    /** A strike: how loud its thunder, and how long until it arrives. */
    onThunder: (loudness: number, delaySeconds: number) => void = () => {},
  ) {
    this.kit = new Kit(reducedMotion);
    this.scene.fog = this.fog;
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: 4,
    });

    this.sky = buildSky(this.kit);
    this.weatherPiece = buildWeather(this.kit, onThunder);
    this.pieces = [
      this.sky,
      ...buildLandscape(this.kit, panes, this.sky.palette),
      buildFireflies(this.kit),
      buildFallingLeaves(this.kit),
      buildHalloween(this.kit),
      this.weatherPiece,
    ];
    for (const piece of this.pieces) this.scene.add(piece.object);
    coverWithSnow(this.scene, this.snow);

    this.moonlight = new THREE.DirectionalLight('#9fb4ff', 2.4);
    this.moonlight.position
      .set(MOON_DIRECTION.x, MOON_DIRECTION.y, MOON_DIRECTION.z)
      .multiplyScalar(200);
    this.skyLight = new THREE.HemisphereLight('#4a5e9a', '#141620', 1.5);
    this.scene.add(this.moonlight, this.skyLight);

    this.panes = panes.map((mesh) => {
      const box = new THREE.Box3().setFromObject(mesh);
      const size = box.getSize(new THREE.Vector3());
      // The pane's own horizontal axis: along x for the north window, z for
      // the side ones — drops keep their size whichever way it faces.
      const across = size.x >= size.z ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      const material = this.kit.keep(this.paneMaterial(across));
      mesh.material = material;
      return { mesh, material, box };
    });

    this.setTheme('classic');
    this.setWeather('clear');
  }

  setTheme(theme: OutsideTheme): void {
    this.theme = theme;
    for (const piece of this.pieces) piece.setTheme?.(theme);
    this.moonlight.color.set(
      theme === 'halloween' ? '#ffb27a' : theme === 'winter' ? '#b8c8ff' : '#9fb4ff',
    );
    this.skyLight.color.set(
      theme === 'halloween' ? '#6a4a86' : theme === 'winter' ? '#6a7aa8' : '#4a5e9a',
    );
  }

  setWeather(weather: Weather): void {
    this.weather = weather;
    for (const piece of this.pieces) piece.setWeather?.(weather);
  }

  /** A player who turned flashing effects off sees no lightning. */
  setFlashAllowed(allowed: boolean): void {
    this.flashAllowed = allowed;
  }

  /** How bright lightning is lighting everything right now (0..1) — the
   * room borrows it for the flash through its windows. */
  get flash(): number {
    return this.flashAllowed ? this.weatherPiece.flash() : 0;
  }

  /** An open window shows the night without glass below `openTo` (a world
   * height: where its sliding sash is; -Infinity when it's shut). */
  setPaneOpen(mesh: THREE.Mesh, openTo: number): void {
    const pane = this.panes.find((candidate) => candidate.mesh === mesh);
    if (pane) pane.material.uniforms.uOpenTo!.value = Math.max(openTo, -1000);
  }

  get currentTheme(): OutsideTheme {
    return this.theme;
  }

  /**
   * Call once per frame, before the room is rendered. Renders the outside
   * only while a window is in view, and only where the windows are.
   */
  render(renderer: THREE.WebGLRenderer, view: THREE.PerspectiveCamera, dt: number, time: number) {
    this.time.value = this.kit.reducedMotion ? 0 : time;
    // The weather settles in over seconds; snow builds up over longer.
    const wet = this.weather === 'rain' ? 0.7 : this.weather === 'storm' ? 1 : 0;
    this.glassRain.value += (wet - this.glassRain.value) * Math.min(1, dt * 0.3);
    this.snow.value +=
      (snowTarget(this.theme, this.weather) - this.snow.value) * Math.min(1, dt * 0.08);

    view.updateMatrixWorld();
    this.projection.multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    const visible = this.panes.filter(({ box }) => this.frustum.intersectsBox(box));
    if (visible.length === 0) return;

    if (!this.formatChecked) {
      // Half-float keeps the moon and lamps bright past 1.0 until the pane
      // tone-maps them; a GPU that can't render to it gets plain 8-bit (the
      // target's GPU side isn't made until its first use, so this is free).
      this.formatChecked = true;
      const floatTargets =
        renderer.extensions.has('EXT_color_buffer_float') ||
        renderer.extensions.has('EXT_color_buffer_half_float');
      if (!floatTargets) this.target.texture.type = THREE.UnsignedByteType;
    }
    renderer.getDrawingBufferSize(this.drawingBuffer);
    for (const pane of this.panes) {
      (pane.material.uniforms.viewSize!.value as THREE.Vector2).copy(this.drawingBuffer);
    }
    const width = Math.max(1, Math.round(this.drawingBuffer.x * RESOLUTION_SCALE));
    const height = Math.max(1, Math.round(this.drawingBuffer.y * RESOLUTION_SCALE));
    if (this.target.width !== width || this.target.height !== height) {
      this.target.setSize(width, height);
    }

    this.camera.copy(view);
    this.camera.far = FAR;
    this.camera.updateProjectionMatrix();
    this.kit.pointScale.value = height / (2 * Math.tan((view.fov * Math.PI) / 360));
    for (const piece of this.pieces) piece.update?.(dt, time, this.camera);

    // Clouds dim the moon and the sky's light; lightning lights it all up.
    const overcast = this.sky.overcast();
    const flash = this.flash;
    this.sky.setFlash(flash);
    this.moonlight.intensity = 2.4 * (1 - 0.85 * overcast) + 5 * flash;
    this.skyLight.intensity =
      1.5 * (1 - 0.35 * overcast) + (this.snow.value > 0.5 ? 0.4 : 0) + 7 * flash;
    const palette = this.sky.palette();
    this.fog.color.copy(palette.horizon).lerp(new THREE.Color('#2a3140'), overcast * 0.7);
    this.fog.density = FOG[this.theme].density + WEATHER_FOG[this.weather] * overcast;

    // Only the part of the screen the windows cover.
    const rect = this.screenRect(
      visible.map(({ box }) => box),
      width,
      height,
    );
    if (rect.z <= 0 || rect.w <= 0) return;
    this.target.scissor.copy(rect);
    this.target.scissorTest = true;

    const previousTarget = renderer.getRenderTarget();
    const previousClear = renderer.getClearColor(new THREE.Color());
    const previousAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(this.fog.color, 1);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousClear, previousAlpha);
  }

  /** A pane's glass: the outside through it, a faint warm reflection of the
   * room, mist in the corners — and in the rain, drops beading on it and
   * running down, bending the view behind them. Where a window is open,
   * none of that: just the night. */
  private paneMaterial(across: THREE.Vector3): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        tOutside: { value: this.target.texture },
        viewSize: { value: new THREE.Vector2(1, 1) },
        roomTint: { value: new THREE.Color('#ffb877') },
        uAcross: { value: across },
        uRain: this.glassRain,
        uTime: this.time,
        uOpenTo: { value: -1000 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorld;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          vNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tOutside;
        uniform vec2 viewSize;
        uniform vec3 roomTint;
        uniform vec3 uAcross;
        uniform float uRain;
        uniform float uTime;
        uniform float uOpenTo;
        varying vec2 vUv;
        varying vec3 vWorld;
        varying vec3 vNormal;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

        // Beads of water sitting on the glass: at most one per cell.
        vec2 beads(vec2 p, float amount) {
          vec2 cell = floor(p);
          vec2 f = fract(p) - 0.5;
          float luck = hash(cell);
          if (luck > amount) return vec2(0.0);
          vec2 at = vec2(hash(cell + 1.7), hash(cell + 3.3)) - 0.5;
          vec2 d = f - at * 0.4;
          float r = 0.16 + 0.2 * hash(cell + 9.1);
          // A round bead: its "normal" is how far from its middle, out to the rim.
          return (d / r) * smoothstep(r, r * 0.85, length(d));
        }

        // Drops running down: one per column, sliding and wobbling, with a
        // wet trail above it.
        vec2 runners(vec2 p, float t) {
          float column = floor(p.x);
          float luck = hash(vec2(column, 4.0));
          if (luck > 0.55) return vec2(0.0);
          float x = fract(p.x) - 0.5 + (luck - 0.5) * 0.4;
          x += sin(p.y * 3.1 + luck * 20.0) * 0.08;
          float head = 2.2 - fract(t * (0.12 + 0.18 * luck) + luck) * 2.8;
          float dy = p.y - head;
          float drop = smoothstep(0.14, 0.06, length(vec2(x, dy * 0.7)));
          float trail = smoothstep(0.05, 0.0, abs(x)) * smoothstep(0.0, 0.08, dy) * smoothstep(0.9, 0.0, dy);
          return vec2(x, dy) * drop * 2.2 + vec2(x, 0.0) * trail * 0.6;
        }

        void main() {
          float glass = step(uOpenTo, vWorld.y);
          // Glass coordinates in metres: drops the same size on every pane.
          vec2 p = vec2(dot(vWorld, uAcross), vWorld.y);
          float wet = uRain * glass;
          vec2 bend = vec2(0.0);
          if (wet > 0.01) {
            bend += beads(p * 17.0, 0.75 * wet);
            bend += beads(p * 31.0 + 7.3, 0.6 * wet) * 0.7;
            bend += runners(p * vec2(9.0, 1.0), uTime);
          }
          // Each drop is a little lens: the view behind it, flipped and shrunk.
          vec2 screen = gl_FragCoord.xy / viewSize - bend * 0.012 * wet;
          vec3 color = texture2D(tOutside, screen).rgb;
          float water = clamp(length(bend), 0.0, 1.0) * wet;
          // A darker rim where the glass bends the light away...
          color *= 1.0 - 0.35 * smoothstep(0.6, 1.0, length(bend)) * wet;
          // ...and a glint of the room's warm light on each drop's top.
          float glint = pow(max(dot(bend, vec2(-0.45, 0.9)), 0.0), 4.0);
          color += vec3(1.0, 0.86, 0.66) * glint * 0.55 * wet;
          color += roomTint * 0.03 * water;
          // Old glass: a faint warm reflection of the room, stronger at
          // grazing angles...
          vec3 view = normalize(cameraPosition - vWorld);
          float grazing = pow(1.0 - clamp(abs(dot(view, vNormal)), 0.0, 1.0), 4.0);
          color = mix(color, color * (1.0 - 0.3 * grazing) + roomTint * (0.012 + 0.09 * grazing), glass);
          // ...and a breath of condensation low in the corners.
          vec2 edge = min(vUv, 1.0 - vUv);
          float mist = smoothstep(0.2, 0.0, min(edge.x, edge.y)) * smoothstep(0.7, 0.0, vUv.y);
          color = mix(color, vec3(0.16, 0.17, 0.2), mist * 0.35 * glass);
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
  }

  /** The pixels (in the outside texture) the visible panes cover. */
  private screenRect(boxes: THREE.Box3[], width: number, height: number): THREE.Vector4 {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const corner = new THREE.Vector4();
    for (const box of boxes) {
      for (let i = 0; i < 8; i += 1) {
        corner.set(
          i & 1 ? box.max.x : box.min.x,
          i & 2 ? box.max.y : box.min.y,
          i & 4 ? box.max.z : box.min.z,
          1,
        );
        corner.applyMatrix4(this.projection);
        if (corner.w <= 0) return new THREE.Vector4(0, 0, width, height); // behind the eye
        const x = ((corner.x / corner.w) * 0.5 + 0.5) * width;
        const y = ((corner.y / corner.w) * 0.5 + 0.5) * height;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    const x = Math.max(0, Math.floor(minX) - 2);
    const y = Math.max(0, Math.floor(minY) - 2);
    return new THREE.Vector4(
      x,
      y,
      Math.min(width, Math.ceil(maxX) + 2) - x,
      Math.min(height, Math.ceil(maxY) + 2) - y,
    );
  }

  dispose(): void {
    this.kit.dispose();
    this.target.dispose();
  }
}
