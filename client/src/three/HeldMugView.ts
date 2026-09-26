import * as THREE from 'three';
import type { Drink, Gesture } from '@custom-tabletop/shared';
import { gestureWeight } from './heldItems.js';
import { buildMug, steamWisp } from './refreshmentMeshes.js';

type Pose = { position: [number, number, number]; rotation: [number, number, number] };

/** Where your own mug is, from your eyes (camera space: ahead is -Z). */
const REST: Pose = { position: [0.2, -0.15, -0.46], rotation: [0.08, -0.35, 0.04] };
const POSES: Partial<Record<Gesture, Pose>> = {
  // Up to your lips, tipped toward you.
  sip: { position: [0.05, -0.11, -0.22], rotation: [0.75, -0.15, 0] },
  // Raised to the others.
  cheers: { position: [0.13, 0.03, -0.48], rotation: [-0.15, -0.3, 0.05] },
};

/**
 * Your own mug of tea or cocoa, in first person (docs/decisions.md, "The
 * cozy room"): everyone else sees it in your character's hand; you see it
 * in the corner of your eye, steaming, lifted to your lips when you sip
 * and raised when you toast.
 */
export class HeldMugView {
  private readonly anchor = new THREE.Group();
  private mug: THREE.Group | null = null;
  private steam: THREE.Sprite[] = [];
  private drink: Drink | null = null;
  private gesture: { kind: Gesture; at: number } | null = null;
  private time = 0;

  constructor(camera: THREE.Camera, scene: THREE.Scene) {
    this.anchor.name = 'held-mug';
    camera.add(this.anchor);
    // The camera's children only render when the camera is in the scene.
    if (!camera.parent) scene.add(camera);
  }

  setDrink(drink: Drink | null): void {
    if (drink === this.drink) return;
    this.drink = drink;
    this.gesture = null;
    this.clear();
    if (!drink) return;
    const mug = buildMug(drink);
    this.steam = [];
    mug.traverse((node) => {
      if (node instanceof THREE.Sprite) {
        node.material = node.material.clone();
        this.steam.push(node);
      }
    });
    this.mug = mug;
    this.anchor.add(mug);
  }

  play(gesture: Gesture): void {
    if (this.mug && (gesture === 'sip' || gesture === 'cheers')) {
      this.gesture = { kind: gesture, at: this.time };
    }
  }

  update(dt: number, visible: boolean): void {
    this.time += dt;
    const mug = this.mug;
    if (!mug) return;
    mug.visible = visible;
    let weight = 0;
    let target: Pose = REST;
    if (this.gesture) {
      const w = gestureWeight(this.gesture.kind, this.time - this.gesture.at);
      if (w === null) this.gesture = null;
      else {
        weight = w;
        target = POSES[this.gesture.kind] ?? REST;
      }
    }
    const mix = (a: number, b: number) => a + (b - a) * weight;
    mug.position.set(
      mix(REST.position[0], target.position[0]),
      mix(REST.position[1], target.position[1]),
      mix(REST.position[2], target.position[2]),
    );
    mug.rotation.set(
      mix(REST.rotation[0], target.rotation[0]),
      mix(REST.rotation[1], target.rotation[1]),
      mix(REST.rotation[2], target.rotation[2]),
    );
    for (const wisp of this.steam) {
      const { rise, size, opacity } = steamWisp(this.time, wisp.userData.phase as number);
      wisp.position.y = 0.065 + rise;
      wisp.scale.setScalar(size);
      // Not while it's at your lips.
      (wisp.material as THREE.SpriteMaterial).opacity = opacity * (1 - weight * 0.8);
    }
  }

  dispose(): void {
    this.clear();
    this.anchor.parent?.remove(this.anchor);
  }

  private clear(): void {
    if (!this.mug) return;
    this.anchor.remove(this.mug);
    this.mug.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.geometry.dispose();
        (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) =>
          m.dispose(),
        );
      } else if (node instanceof THREE.Sprite) {
        node.material.dispose();
      }
    });
    this.mug = null;
    this.steam = [];
  }
}
