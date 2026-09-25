import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { playerColorHex, type PlayerColorId } from '@custom-tabletop/shared';
import { CharacterLibrary, type CharacterAsset } from './characters.js';
import { lerpAngle, smoothingFactor } from './avatarMotion.js';

// Module-level so a model picked once stays loaded for the whole visit.
const library = new CharacterLibrary();

/** Three-quarter view: shows the face *and* the outfit's profile. */
const REST_YAW = -0.4;
/** How quickly the character turns back to face you after a spin. */
const SETTLE_HALF_LIFE = 0.35;
const DRAG_RADIANS_PER_PX = 0.012;
const CROSSFADE_SECONDS = 0.3;
const MAX_FRAME_SECONDS = 0.1;

/**
 * The join screen's hero: the character your color plays as, on a little
 * pedestal, idling — and waving when you pick them. Drag to spin; they turn
 * back on release. Decorative (the caption beside it names the character),
 * so it's hidden from assistive tech.
 */
export function CharacterPreview({ color }: { color: PlayerColorId }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<PreviewStage | null>(null);
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    let stage: PreviewStage;
    try {
      stage = new PreviewStage(container);
    } catch {
      setUnsupported(true); // no WebGL — the caption still says who you are
      return;
    }
    stageRef.current = stage;
    return () => {
      stage.dispose();
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    library.load(color).then(
      (asset) => {
        if (!cancelled) {
          stage.show(asset, color);
          setLoading(false);
        }
      },
      () => {
        if (!cancelled) {
          setLoading(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [color]);

  return (
    <div
      ref={containerRef}
      className={`character-preview${loading ? ' loading' : ''}${unsupported ? ' unsupported' : ''}`}
      aria-hidden="true"
    />
  );
}

/** The Three.js side: renderer, lights, pedestal, the current model. */
class PreviewStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
  private readonly timer = new THREE.Timer();
  private readonly turntable = new THREE.Group();
  private readonly observer: ResizeObserver;
  private readonly disposables: { dispose(): void }[] = [];
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  private model: THREE.Object3D | null = null;
  private modelMaterials: THREE.Material[] = [];
  private mixer: THREE.AnimationMixer | null = null;
  private entrance = 1; // 0 → 1: the brief "step up" when a model appears
  private yaw = REST_YAW;
  private spin = 0; // radians/second left over from a flick
  private dragX: number | null = null;
  private frameId = 0;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.camera.position.set(0, 1.05, 4.6);
    this.camera.lookAt(0, 0.88, 0);

    this.scene.add(new THREE.HemisphereLight(0xfff1e0, 0x3a2416, 1.1));
    const key = new THREE.DirectionalLight(0xffd9a8, 2.4);
    key.position.set(2, 3, 3);
    const rim = new THREE.DirectionalLight(0x9fb8ff, 1.8);
    rim.position.set(-2.5, 2.5, -2.5);
    this.scene.add(key, rim, this.turntable);
    this.buildPedestal();

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointercancel', this.handlePointerUp);

    this.frameId = requestAnimationFrame(this.animate);
  }

  show(asset: CharacterAsset, color: PlayerColorId): void {
    this.clearModel();

    const model = cloneSkinned(asset.scene);
    model.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        // Cloned so tinting this preview never touches the cached asset.
        const material = (node.material as THREE.MeshStandardMaterial).clone();
        if (material.name === 'Shirt') {
          material.color.set(playerColorHex(color));
        }
        node.material = material;
        node.frustumCulled = false; // skinned bounds don't follow animation
        this.modelMaterials.push(material);
      }
    });

    const mixer = new THREE.AnimationMixer(model);
    const clip = (name: string) => asset.animations.find((candidate) => candidate.name === name);
    const idleClip = clip('Idle');
    const waveClip = clip('Wave');
    const idle = idleClip ? mixer.clipAction(idleClip) : null;
    if (waveClip && !this.reducedMotion) {
      // Say hello first, then settle into the idle loop.
      const wave = mixer.clipAction(waveClip);
      wave.setLoop(THREE.LoopOnce, 1);
      wave.clampWhenFinished = true;
      wave.play();
      mixer.addEventListener('finished', (event) => {
        if (event.action === wave && idle) {
          idle.reset().play();
          wave.crossFadeTo(idle, CROSSFADE_SECONDS, false);
        }
      });
    } else {
      idle?.play();
    }

    this.turntable.add(model);
    this.model = model;
    this.mixer = mixer;
    this.entrance = this.reducedMotion ? 1 : 0;
    this.render(0); // a first frame right away, even if rAF is throttled
  }

  dispose(): void {
    cancelAnimationFrame(this.frameId);
    this.observer.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.handlePointerDown);
    canvas.removeEventListener('pointermove', this.handlePointerMove);
    canvas.removeEventListener('pointerup', this.handlePointerUp);
    canvas.removeEventListener('pointercancel', this.handlePointerUp);
    this.clearModel();
    this.disposables.forEach((item) => item.dispose());
    this.renderer.dispose();
    // Free the context now: the room's own renderer is created right after.
    this.renderer.forceContextLoss();
    canvas.remove();
  }

  private buildPedestal(): void {
    const wood = new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 0.55 });
    const base = new THREE.CylinderGeometry(0.62, 0.7, 0.12, 64);
    const pedestal = new THREE.Mesh(base, wood);
    pedestal.position.y = -0.06;

    const brass = new THREE.MeshStandardMaterial({
      color: 0xc9a15a,
      metalness: 0.85,
      roughness: 0.3,
    });
    const ringGeometry = new THREE.TorusGeometry(0.62, 0.012, 8, 96);
    const ring = new THREE.Mesh(ringGeometry, brass);
    ring.rotation.x = Math.PI / 2;

    // A soft contact shadow so the character stands *on* the pedestal.
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = shadowCanvas.height = 128;
    const ctx = shadowCanvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);
    }
    const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
    const shadowMaterial = new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      depthWrite: false,
    });
    const shadowGeometry = new THREE.PlaneGeometry(0.9, 0.9);
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;

    this.scene.add(pedestal, ring, shadow);
    this.disposables.push(
      wood,
      base,
      brass,
      ringGeometry,
      shadowTexture,
      shadowMaterial,
      shadowGeometry,
    );
  }

  private clearModel(): void {
    if (this.model) {
      this.turntable.remove(this.model);
      this.mixer?.stopAllAction();
    }
    // Geometry and textures are shared with the cached asset — only the
    // per-preview material clones are ours to free.
    this.modelMaterials.forEach((material) => material.dispose());
    this.modelMaterials = [];
    this.model = null;
    this.mixer = null;
  }

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.render(0);
  }

  private readonly animate = (timestamp?: number) => {
    this.frameId = requestAnimationFrame(this.animate);
    this.timer.update(timestamp);
    this.render(Math.min(this.timer.getDelta(), MAX_FRAME_SECONDS));
  };

  private render(dt: number): void {
    if (this.dragX === null) {
      if (Math.abs(this.spin) > 0.05 && !this.reducedMotion) {
        this.yaw += this.spin * dt;
        this.spin *= Math.exp(-dt * 3);
      } else {
        this.spin = 0;
        this.yaw = lerpAngle(this.yaw, REST_YAW, smoothingFactor(dt, SETTLE_HALF_LIFE));
      }
    }
    this.turntable.rotation.y = this.yaw;

    if (this.model && this.entrance < 1) {
      this.entrance = Math.min(1, this.entrance + dt / 0.35);
      const eased = 1 - (1 - this.entrance) ** 3;
      this.model.scale.setScalar(0.92 + 0.08 * eased);
      this.model.position.y = 0.06 * (1 - eased);
    }
    this.mixer?.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private readonly handlePointerDown = (event: PointerEvent) => {
    this.dragX = event.clientX;
    this.spin = 0;
    this.renderer.domElement.setPointerCapture(event.pointerId);
    this.renderer.domElement.classList.add('dragging');
  };

  private readonly handlePointerMove = (event: PointerEvent) => {
    if (this.dragX === null) {
      return;
    }
    const delta = (event.clientX - this.dragX) * DRAG_RADIANS_PER_PX;
    this.dragX = event.clientX;
    this.yaw += delta;
    // Remember the flick's speed (per ~16 ms move) for a little inertia.
    this.spin = delta * 60;
  };

  private readonly handlePointerUp = (event: PointerEvent) => {
    if (this.dragX === null) {
      return;
    }
    this.dragX = null;
    if (this.renderer.domElement.hasPointerCapture(event.pointerId)) {
      this.renderer.domElement.releasePointerCapture(event.pointerId);
    }
    this.renderer.domElement.classList.remove('dragging');
  };
}
