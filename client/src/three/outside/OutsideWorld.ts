import * as THREE from 'three';
import { Kit, type OutsideTheme, type Piece } from './kit.js';
import { buildSky } from './sky.js';
import { buildLandscape } from './landscape.js';
import { buildFallingLeaves, buildFireflies } from './life.js';
import { buildHalloween } from './halloween.js';
import { MOON_DIRECTION } from './terrain.js';

/** The outside is rendered at this fraction of the screen's resolution —
 * seen through old glass, a little softness is right, and it's cheaper. */
const RESOLUTION_SCALE = 0.6;
/** How far the outside camera sees (the room's own camera stops at 100 m). */
const FAR = 2000;

const FOG: Record<OutsideTheme, { density: number }> = {
  classic: { density: 0.0055 },
  halloween: { density: 0.0095 },
};

/**
 * The world outside the windows (docs/decisions.md, "The world outside"): a
 * whole night landscape in its own scene — sky, moon, lake, woods, a village
 * on a hill, fireflies, falling leaves — seen through every window pane as
 * if the walls had real holes in them.
 *
 * How: each frame a window is on screen, the outside is rendered from the
 * player's own camera into a texture (scissored to the panes), and each pane
 * shows that texture at its own screen position. So what's behind a window
 * has true perspective and parallax — walk past one and the lamp post slides
 * against the hills — without cutting the room's walls open.
 */
export class OutsideWorld {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera();
  private readonly kit: Kit;
  private readonly pieces: Piece[];
  private readonly target: THREE.WebGLRenderTarget;
  private readonly paneMaterial: THREE.ShaderMaterial;
  private readonly paneBoxes: THREE.Box3[];
  private readonly frustum = new THREE.Frustum();
  private readonly projection = new THREE.Matrix4();
  private readonly drawingBuffer = new THREE.Vector2();
  private readonly fog = new THREE.FogExp2(0x000000, FOG.classic.density);
  private readonly moonlight: THREE.DirectionalLight;
  private readonly skyLight: THREE.HemisphereLight;
  private readonly palette: ReturnType<typeof buildSky>['palette'];
  private theme: OutsideTheme = 'classic';
  private formatChecked = false;

  constructor(panes: THREE.Mesh[], reducedMotion = false) {
    this.kit = new Kit(reducedMotion);
    this.scene.fog = this.fog;
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: 4,
    });

    const sky = buildSky(this.kit);
    this.palette = sky.palette;
    this.pieces = [
      sky,
      ...buildLandscape(this.kit, panes, sky.palette),
      buildFireflies(this.kit),
      buildFallingLeaves(this.kit),
      buildHalloween(this.kit),
    ];
    for (const piece of this.pieces) this.scene.add(piece.object);

    this.moonlight = new THREE.DirectionalLight('#9fb4ff', 2.4);
    this.moonlight.position
      .set(MOON_DIRECTION.x, MOON_DIRECTION.y, MOON_DIRECTION.z)
      .multiplyScalar(200);
    this.skyLight = new THREE.HemisphereLight('#4a5e9a', '#141620', 1.5);
    this.scene.add(this.moonlight, this.skyLight);

    this.paneMaterial = this.kit.keep(
      new THREE.ShaderMaterial({
        uniforms: {
          tOutside: { value: this.target.texture },
          viewSize: { value: new THREE.Vector2(1, 1) },
          roomTint: { value: new THREE.Color('#ffb877') },
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
          varying vec2 vUv;
          varying vec3 vWorld;
          varying vec3 vNormal;
          void main() {
            vec3 color = texture2D(tOutside, gl_FragCoord.xy / viewSize).rgb;
            // Old glass: a faint warm reflection of the room, stronger at
            // grazing angles...
            vec3 view = normalize(cameraPosition - vWorld);
            float grazing = pow(1.0 - clamp(abs(dot(view, vNormal)), 0.0, 1.0), 4.0);
            color = color * (1.0 - 0.3 * grazing) + roomTint * (0.012 + 0.09 * grazing);
            // ...and a breath of condensation low in the corners.
            vec2 edge = min(vUv, 1.0 - vUv);
            float mist = smoothstep(0.2, 0.0, min(edge.x, edge.y)) * smoothstep(0.7, 0.0, vUv.y);
            color = mix(color, vec3(0.16, 0.17, 0.2), mist * 0.35);
            gl_FragColor = vec4(color, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      }),
    );
    for (const pane of panes) pane.material = this.paneMaterial;
    this.paneBoxes = panes.map((pane) => new THREE.Box3().setFromObject(pane));

    this.setTheme('classic');
  }

  setTheme(theme: OutsideTheme): void {
    this.theme = theme;
    for (const piece of this.pieces) piece.setTheme?.(theme);
    const palette = this.palette();
    this.fog.color.copy(palette.horizon);
    this.fog.density = FOG[theme].density;
    this.moonlight.color.set(theme === 'halloween' ? '#ffb27a' : '#9fb4ff');
    this.skyLight.color.set(theme === 'halloween' ? '#6a4a86' : '#4a5e9a');
  }

  get currentTheme(): OutsideTheme {
    return this.theme;
  }

  /**
   * Call once per frame, before the room is rendered. Renders the outside
   * only while a window is in view, and only where the windows are.
   */
  render(renderer: THREE.WebGLRenderer, view: THREE.PerspectiveCamera, dt: number, time: number) {
    view.updateMatrixWorld();
    this.projection.multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    const visible = this.paneBoxes.filter((box) => this.frustum.intersectsBox(box));
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
    (this.paneMaterial.uniforms.viewSize!.value as THREE.Vector2).copy(this.drawingBuffer);
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

    // Only the part of the screen the windows cover.
    const rect = this.screenRect(visible, width, height);
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
