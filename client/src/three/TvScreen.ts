import * as THREE from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';

/** The embedded player's size in CSS pixels (the TV is 4:3). */
export const TV_PLAYER_WIDTH = 800;
export const TV_PLAYER_HEIGHT = 600;

/** The CSS layer works in millimetres rather than the room's metres (its
 * scene and camera scaled up by this): in metres the 800px player is
 * scaled by ~0.001, which some engines mishandle (WebKit measured the
 * screen at 1x1px). Same picture, well-conditioned numbers. */
const CSS_SCALE = 1000;

/** Frames in a row the screen may land in the wrong place before the TV
 * gives up on this browser (see `verify`). */
const MAX_MISPLACED_FRAMES = 10;

/**
 * The room's console TV as a real screen: YouTube's own player (an iframe,
 * which can't be drawn into WebGL) is placed exactly over the `TV_Screen`
 * rectangle with a CSS3D layer that sits *underneath* the WebGL canvas, and
 * while something plays the screen mesh punches a transparent hole in the
 * canvas so the player shows through. Anything in front of the TV (a
 * player walking by) still draws over it, so occlusion just works.
 *
 * `element` is where the player goes (the caller portals it in). A soft,
 * cool light spills from the screen while it's on.
 */
export class TvScreen {
  readonly element: HTMLDivElement;
  private readonly css = new CSS3DRenderer();
  private readonly cssScene = new THREE.Scene();
  private readonly cssCamera = new THREE.PerspectiveCamera();
  private readonly object: CSS3DObject;
  private readonly offMaterial: THREE.Material | THREE.Material[];
  private readonly holeMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    opacity: 0,
    blending: THREE.NoBlending,
  });
  private readonly glow: THREE.PointLight;
  private readonly normal: THREE.Vector3;
  private readonly center: THREE.Vector3;
  private playing = false;
  /** Whether this browser draws the CSS 3D layer where it belongs: null
   * until checked on the first frames the screen is in view. */
  private supported: boolean | null = null;
  private misplacedFrames = 0;

  /** `onUnsupported` fires (once) if this browser can't place the CSS 3D
   * layer — the caller then plays clips in the corner player instead. */
  constructor(
    container: HTMLElement,
    scene: THREE.Scene,
    private readonly screen: THREE.Mesh,
    private readonly onUnsupported: () => void = () => {},
  ) {
    this.offMaterial = screen.material;
    screen.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(screen);
    this.center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const width = Math.max(size.x, size.z);
    this.normal = screenNormal(screen);

    this.element = document.createElement('div');
    this.element.className = 'tv-screen';
    this.element.style.width = `${TV_PLAYER_WIDTH}px`;
    this.element.style.height = `${TV_PLAYER_HEIGHT}px`;
    this.object = new CSS3DObject(this.element);
    this.object.position.copy(this.center).multiplyScalar(CSS_SCALE);
    this.object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.normal);
    this.object.scale.setScalar((width * CSS_SCALE) / TV_PLAYER_WIDTH);
    this.cssScene.add(this.object);

    this.css.domElement.className = 'tv-layer';
    container.prepend(this.css.domElement);

    this.glow = new THREE.PointLight(0xa8bcff, 0, 4.5, 2);
    this.glow.position.copy(this.center).addScaledVector(this.normal, 0.55);
    scene.add(this.glow);
  }

  /** Something is on: punch the hole and light the room a little. */
  setPlaying(playing: boolean): void {
    this.playing = playing;
    this.screen.material = playing ? this.holeMaterial : this.offMaterial;
    this.element.style.visibility = playing ? 'visible' : 'hidden';
    if (!playing) this.glow.intensity = 0;
  }

  /** Call once per frame after the WebGL render, with the canvas size. */
  render(
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number,
    time: number,
    allowed = true,
  ): void {
    if (!this.playing) return;
    // Hidden when the screen faces away (or is behind us) — CSS would draw
    // it mirrored — or while the view can't show it (the top-down table
    // view), but kept alive, so the sound carries on.
    const toCamera = camera.position.clone().sub(this.center);
    const facing = allowed && toCamera.dot(this.normal) > 0;
    this.element.style.visibility = facing ? 'visible' : 'hidden';
    this.glow.intensity = 1.1 + 0.25 * Math.sin(time * 9.7) * Math.sin(time * 3.1);
    const size = this.css.getSize();
    if (size.width !== width || size.height !== height) this.css.setSize(width, height);
    const cssCamera = this.cssCamera;
    camera.getWorldPosition(cssCamera.position).multiplyScalar(CSS_SCALE);
    camera.getWorldQuaternion(cssCamera.quaternion);
    cssCamera.fov = camera.fov;
    cssCamera.aspect = camera.aspect;
    cssCamera.zoom = camera.zoom;
    cssCamera.near = camera.near * CSS_SCALE;
    cssCamera.far = camera.far * CSS_SCALE;
    cssCamera.updateProjectionMatrix();
    cssCamera.updateMatrixWorld();
    this.css.render(this.cssScene, cssCamera);
    if (facing && this.supported === null) {
      this.verify(camera, width, height);
    }
  }

  /** Checks the player really sits over the TV on screen. Some engines
   * (e.g. WebKit builds without 3D-transform compositing) flatten or
   * misplace the CSS 3D layer, which would leave a black hole where the
   * screen is; after a few such frames the TV reports itself unsupported. */
  private verify(camera: THREE.PerspectiveCamera, width: number, height: number): void {
    const projected = this.center.clone().project(camera);
    if (projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) {
      return; // off-screen: nothing to compare yet
    }
    const layer = this.css.domElement.getBoundingClientRect();
    const rect = this.element.getBoundingClientRect();
    const offset = Math.hypot(
      rect.left - layer.left + rect.width / 2 - ((projected.x + 1) / 2) * width,
      rect.top - layer.top + rect.height / 2 - ((1 - projected.y) / 2) * height,
    );
    const tolerance = Math.max(30, 0.35 * Math.max(rect.width, rect.height));
    if (rect.width > 2 && rect.height > 2 && offset <= tolerance) {
      this.supported = true;
      return;
    }
    this.misplacedFrames += 1;
    if (this.misplacedFrames >= MAX_MISPLACED_FRAMES) {
      this.supported = false;
      this.onUnsupported();
    }
  }

  dispose(): void {
    this.screen.material = this.offMaterial;
    this.holeMaterial.dispose();
    this.glow.parent?.remove(this.glow);
    this.css.domElement.remove();
  }
}

/** The screen quad's outward (viewer-facing) normal, in world space. */
function screenNormal(mesh: THREE.Mesh): THREE.Vector3 {
  const geometry = mesh.geometry;
  const normals = geometry.getAttribute('normal');
  const local = normals
    ? new THREE.Vector3().fromBufferAttribute(normals, 0)
    : new THREE.Vector3(0, 0, 1);
  return local.transformDirection(mesh.matrixWorld).normalize();
}
