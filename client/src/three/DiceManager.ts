import * as THREE from 'three';
import type { Dice } from '@custom-tabletop/shared';
import { planDiceSync } from './diceSync.js';

/** Exported so callers spawning a die (App.tsx) can rest it on the table
 * surface without duplicating this magic number. */
export const DIE_SIZE = 0.12;
const LABEL_SIZE = 0.16;
const LABEL_CANVAS_SIZE = 128;
const SPIN_DURATION_S = 1;
const SPIN_MAX_SPEED = 18; // radians/second, eased out to 0 over SPIN_DURATION_S

function createLabelTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = LABEL_CANVAS_SIZE;
  canvas.height = LABEL_CANVAS_SIZE;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f4ead9';
    ctx.beginPath();
    ctx.arc(
      LABEL_CANVAS_SIZE / 2,
      LABEL_CANVAS_SIZE / 2,
      LABEL_CANVAS_SIZE / 2 - 4,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.fillStyle = '#241a12';
    ctx.font = 'bold 72px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, LABEL_CANVAS_SIZE / 2, LABEL_CANVAS_SIZE / 2 + 4);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** One die's meshes: a spinning cube (the "motion" the exit check asks
 * for) plus a camera-facing sprite label showing the current result (or
 * "?" until rolled) — decoupled from the cube's rotation, so the label
 * never needs to compute which face is physically "up". */
function createDieObject(): THREE.Group {
  const group = new THREE.Group();

  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE),
    new THREE.MeshStandardMaterial({ color: 0xf4ead9, roughness: 0.4 }),
  );
  cube.name = 'cube';
  group.add(cube);

  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: createLabelTexture('?'), transparent: true }),
  );
  label.name = 'label';
  label.scale.set(LABEL_SIZE, LABEL_SIZE, 1);
  label.position.y = DIE_SIZE * 0.9;
  group.add(label);

  return group;
}

function setLabel(die: THREE.Group, result: number | null): void {
  const label = die.getObjectByName('label') as THREE.Sprite | undefined;
  if (!label) {
    return;
  }
  const material = label.material as THREE.SpriteMaterial;
  material.map?.dispose();
  material.map = createLabelTexture(result === null ? '?' : String(result));
  material.needsUpdate = true;
}

/**
 * Placeholder 3D dice (Milestone 6): a spinning cube plus a result label,
 * one per `GameState.dice` entry. Unlike `PlayerAvatars`/`player:move`,
 * dice changes (spawn/roll/remove) all arrive through the same
 * ack + full-`GameState`-broadcast channel as scenes — there's no separate
 * high-frequency delta stream to split membership from live updates, so
 * `sync` alone (driven by `planDiceSync`) handles all three.
 */
export class DiceManager {
  private readonly group = new THREE.Group();
  private readonly dice = new Map<string, THREE.Group>();
  private knownResults = new Map<string, number | null>();
  private readonly spinElapsed = new Map<string, number>();

  constructor(scene: THREE.Scene) {
    this.group.name = 'dice';
    scene.add(this.group);
  }

  sync(dice: Dice[]): void {
    const plan = planDiceSync(dice, this.knownResults);

    for (const id of plan.removed) {
      this.removeDie(id);
    }

    for (const die of dice) {
      let entry = this.dice.get(die.id);
      if (!entry) {
        entry = createDieObject();
        this.dice.set(die.id, entry);
        this.group.add(entry);
        setLabel(entry, die.result);
      }
      entry.position.set(die.position.x, die.position.y, die.position.z);
    }

    for (const id of plan.rolled) {
      this.spinElapsed.set(id, 0);
      const die = dice.find((candidate) => candidate.id === id);
      const entry = this.dice.get(id);
      if (die && entry) {
        setLabel(entry, die.result);
      }
    }

    this.knownResults = new Map(dice.map((die) => [die.id, die.result]));
  }

  /** Advances any in-progress roll-spin animations. Call once per frame. */
  update(deltaSeconds: number): void {
    for (const [id, elapsed] of this.spinElapsed) {
      const entry = this.dice.get(id);
      if (!entry) {
        this.spinElapsed.delete(id);
        continue;
      }

      const next = elapsed + deltaSeconds;
      const progress = Math.min(next / SPIN_DURATION_S, 1);
      const speed = SPIN_MAX_SPEED * (1 - progress);
      const cube = entry.getObjectByName('cube');
      if (cube) {
        cube.rotation.x += speed * deltaSeconds;
        cube.rotation.y += speed * deltaSeconds * 0.7;
      }

      if (progress >= 1) {
        this.spinElapsed.delete(id);
      } else {
        this.spinElapsed.set(id, next);
      }
    }
  }

  dispose(): void {
    for (const id of [...this.dice.keys()]) {
      this.removeDie(id);
    }
    this.group.parent?.remove(this.group);
  }

  private removeDie(id: string): void {
    const entry = this.dice.get(id);
    if (!entry) {
      return;
    }
    this.group.remove(entry);
    for (const child of entry.children) {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      } else if (child instanceof THREE.Sprite) {
        (child.material.map as THREE.Texture | null)?.dispose();
        child.material.dispose();
      }
    }
    this.dice.delete(id);
    this.spinElapsed.delete(id);
  }
}
