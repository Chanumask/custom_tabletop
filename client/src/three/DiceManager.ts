import * as THREE from 'three';
import {
  DIE_FACES,
  playerColorHex,
  type Dice,
  type DieKind,
  type Player,
} from '@custom-tabletop/shared';
import { planDiceSync } from './diceSync.js';
import {
  ATLAS_FILL,
  atlasLayout,
  buildDieGeometry,
  dieShape,
  faceCorners2D,
  restingQuaternion,
  rollRandom,
  type DieShape,
} from './diceShapes.js';
import { contrastRatio } from '../whiteboardInk.js';

/** How long a roll tumbles before it settles on its result. */
export const TUMBLE_SECONDS = 1.1;
/** A carried die hovers this much above the table (m). */
const DRAG_LIFT = 0.02;
const HOP_HEIGHT = 0.14;
const LABEL_SIZE = 0.11;
const LABEL_GAP = 0.06;
const REVEAL_SECONDS = 0.3;
const ATLAS_CELL_PX = 128;
/** A die nobody owns anymore (its player left) is plain ivory. */
const UNOWNED_BODY = '#efe6d4';
/** See materialFor. */
const DIE_ALBEDO_SCALE = 0.3;

type Players = Pick<Player, 'id' | 'color'>[];

interface Tumble {
  elapsed: number;
  from: THREE.Quaternion;
  to: THREE.Quaternion;
  axis: THREE.Vector3;
  turns: number;
}

interface DieEntry {
  kind: DieKind;
  body: string;
  root: THREE.Group;
  mesh: THREE.Mesh;
  label: THREE.Sprite;
  result: number | null;
  tumble: Tumble | null;
  /** Seconds into the result badge's pop-in, or null once it's shown. */
  reveal: number | null;
}

/** The ink for numbers on a die body: whichever of cream/dark reads better. */
function numberInk(body: string): string {
  return contrastRatio('#fff8ec', body) >= contrastRatio('#22170f', body) ? '#fff8ec' : '#22170f';
}

/** Paints a die's texture: each face's cell in the body color, its edge
 * darkened a little (so edges read even in flat light), its number(s). */
function paintAtlas(shape: DieShape, body: string): HTMLCanvasElement {
  const { cols, rows } = atlasLayout(shape);
  const canvas = document.createElement('canvas');
  canvas.width = cols * ATLAS_CELL_PX;
  canvas.height = rows * ATLAS_CELL_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return canvas;
  }
  const ink = numberInk(body);
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const faceCount = DIE_FACES[shape.kind];
  const fontPx =
    ATLAS_CELL_PX * { d4: 0.2, d6: 0.42, d8: 0.3, d10: 0.26, d12: 0.3, d20: 0.24 }[shape.kind];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  shape.faces.forEach((face, index) => {
    const cx = ((index % cols) + 0.5) * ATLAS_CELL_PX;
    const cy = (Math.floor(index / cols) + 0.5) * ATLAS_CELL_PX;
    const corners = faceCorners2D(shape, face);
    const toCanvas = (p: THREE.Vector2, scale = 1) =>
      [
        cx + p.x * ATLAS_FILL * ATLAS_CELL_PX * scale,
        cy - p.y * ATLAS_FILL * ATLAS_CELL_PX * scale,
      ] as const;

    // Bevelled edge: a soft dark line just inside the face's outline.
    ctx.save();
    ctx.beginPath();
    corners.forEach((corner, i) => {
      const [x, y] = toCanvas(corner);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.clip();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = ink;
    ctx.font = `800 ${fontPx}px system-ui, "Segoe UI", sans-serif`;
    const drawNumber = (value: number, x: number, y: number, angle: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillText(String(value), 0, 0);
      // 6 and 9 look alike upside down: underline them, as real dice do.
      if (faceCount >= 8 && (value === 6 || value === 9)) {
        ctx.fillRect(-fontPx * 0.22, fontPx * 0.42, fontPx * 0.44, fontPx * 0.08);
      }
      ctx.restore();
    };

    if (shape.kind === 'd4') {
      // Each corner's number sits near that corner, its top toward it.
      corners.forEach((corner, i) => {
        const [x, y] = toCanvas(corner, 0.52);
        drawNumber(face.cornerValues![i]!, x, y, Math.atan2(corner.x, corner.y));
      });
    } else {
      // A d20's triangles put the number a little below their centroid,
      // i.e. in the widest part of the face.
      const drop = shape.kind === 'd20' || shape.kind === 'd8' ? fontPx * 0.12 : 0;
      drawNumber(face.value, cx, cy + drop, 0);
    }
  });
  return canvas;
}

/** The floating result badge: a disc with the number — gold for a natural
 * 20 on a d20, red for a natural 1. */
function paintLabel(result: number, kind: DieKind, accent: string): HTMLCanvasElement {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return canvas;
  }
  const critical = kind === 'd20' && result === 20;
  const fumble = kind === 'd20' && result === 1;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
  ctx.fillStyle = critical ? '#f3c55b' : fumble ? '#c9412f' : '#f8f0e1';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = critical ? '#fff3c4' : accent;
  ctx.stroke();
  ctx.fillStyle = fumble ? '#fff8ec' : '#22170f';
  ctx.font = `800 ${result >= 10 ? 58 : 68}px system-ui, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(result), size / 2, size / 2 + 4);
  return canvas;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * The dice on the table, one per `GameState.dice` entry: real polyhedra
 * (d4–d20) with numbered faces, in their owner's player color. A roll
 * tumbles and hops, then settles with the server's result on top — the
 * tumble is seeded by the die id and roll count, so every client sees the
 * same final pose. A small badge above the die repeats the result for
 * anyone too far away to read the face.
 */
export class DiceManager {
  private readonly group = new THREE.Group();
  private readonly dice = new Map<string, DieEntry>();
  private readonly geometries = new Map<DieKind, THREE.BufferGeometry>();
  private readonly materials = new Map<string, THREE.MeshPhysicalMaterial>();
  private knownRollCounts = new Map<string, number>();
  private seated = false;
  private readonly badgeOffset = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    /** Called when rolls start animating (for the clatter sound). */
    private readonly onRollStart: (diceCount: number) => void = () => {},
  ) {
    this.group.name = 'dice';
    scene.add(this.group);
  }

  sync(dice: Dice[], players: Players): void {
    const plan = planDiceSync(dice, this.knownRollCounts);
    plan.removed.forEach((id) => this.removeDie(id));

    for (const die of dice) {
      const owner = players.find((player) => player.id === die.ownerId);
      const body = owner ? playerColorHex(owner.color) : UNOWNED_BODY;
      let entry = this.dice.get(die.id);
      if (!entry) {
        entry = this.createDie(die, body);
      } else if (entry.body !== body) {
        entry.body = body;
        entry.mesh.material = this.materialFor(die.kind, body);
        if (entry.result !== null) {
          this.setLabel(entry, entry.result);
        }
      }
      const shape = dieShape(die.kind);
      entry.root.position.set(die.position.x, die.position.y + shape.restHeight, die.position.z);
    }

    for (const id of plan.rolled) {
      const die = dice.find((candidate) => candidate.id === id);
      const entry = this.dice.get(id);
      if (die && entry && die.result !== null) {
        this.startTumble(id, entry, die.result, die.rollCount);
      }
    }
    if (plan.rolled.length > 0) {
      this.onRollStart(plan.rolled.length);
    }

    this.knownRollCounts = new Map(dice.map((die) => [die.id, die.rollCount]));
  }

  /** The die under a ray (for aim + interact), or null. */
  pick(raycaster: THREE.Raycaster): string | null {
    const hit = raycaster.intersectObjects(
      [...this.dice.values()].map((entry) => entry.mesh),
      false,
    )[0];
    if (!hit) {
      return null;
    }
    for (const [id, entry] of this.dice) {
      if (entry.mesh === hit.object) {
        return id;
      }
    }
    return null;
  }

  /** Seated, the view looks straight down at the table: badges then sit
   * beside their die instead of above it, where they'd hide its top face. */
  setSeated(seated: boolean): void {
    this.seated = seated;
  }

  /** A local drag: the die follows the pointer at once (it's settled
   * where the pointer leaves it; the move is sent separately). */
  carry(id: string, position: { x: number; y: number; z: number }): void {
    const entry = this.dice.get(id);
    if (!entry) return;
    entry.root.position.set(
      position.x,
      position.y + dieShape(entry.kind).restHeight + DRAG_LIFT,
      position.z,
    );
  }

  /** Advances tumbles and badge pop-ins. Call once per frame. */
  update(deltaSeconds: number, camera?: THREE.Camera): void {
    if (this.seated && camera) {
      // "Beside" = to the right on screen, whatever way the view is turned.
      this.badgeOffset.set(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize();
    }
    for (const entry of this.dice.values()) {
      this.placeBadge(entry);
      const tumble = entry.tumble;
      if (tumble) {
        tumble.elapsed += deltaSeconds;
        const t = Math.min(tumble.elapsed / TUMBLE_SECONDS, 1);
        const settle = easeOutCubic(t);
        // Spin about the tumble axis that unwinds to zero exactly as the
        // pose arrives at its target — continuous at both ends.
        const spin = new THREE.Quaternion().setFromAxisAngle(
          tumble.axis,
          (1 - settle) * tumble.turns * Math.PI * 2,
        );
        entry.mesh.quaternion.copy(tumble.from).slerp(tumble.to, settle).premultiply(spin);
        // Two shrinking hops, then still.
        entry.mesh.position.y = HOP_HEIGHT * Math.abs(Math.sin(t * Math.PI * 2)) * (1 - t) ** 2;
        if (t >= 1) {
          entry.mesh.quaternion.copy(tumble.to);
          entry.mesh.position.y = 0;
          entry.tumble = null;
          entry.reveal = 0;
        }
      }

      if (entry.reveal !== null) {
        entry.reveal += deltaSeconds;
        const t = Math.min(entry.reveal / REVEAL_SECONDS, 1);
        // Pops slightly past full size, then settles.
        const pop = t < 0.7 ? easeOutCubic(t / 0.7) * 1.15 : 1.15 - 0.15 * ((t - 0.7) / 0.3);
        entry.label.visible = true;
        entry.label.scale.set(LABEL_SIZE * pop, LABEL_SIZE * pop, 1);
        if (t >= 1) {
          entry.reveal = null;
        }
      }
    }
  }

  dispose(): void {
    for (const id of [...this.dice.keys()]) {
      this.removeDie(id);
    }
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => {
      material.map?.dispose();
      material.dispose();
    });
    this.geometries.clear();
    this.materials.clear();
    this.group.parent?.remove(this.group);
  }

  private createDie(die: Dice, body: string): DieEntry {
    const shape = dieShape(die.kind);
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(this.geometryFor(die.kind), this.materialFor(die.kind, body));
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
    label.position.y = shape.restHeight + LABEL_GAP + LABEL_SIZE / 2;
    label.scale.set(LABEL_SIZE, LABEL_SIZE, 1);
    label.visible = false;
    root.add(mesh, label);
    this.group.add(root);

    const entry: DieEntry = {
      kind: die.kind,
      body,
      root,
      mesh,
      label,
      result: die.result,
      tumble: null,
      reveal: null,
    };
    // Already rolled (a later joiner, or a reload): show it as it lies. A
    // fresh die shows its highest number up — ready to roll.
    const shown = die.result ?? DIE_FACES[die.kind];
    const yaw = rollRandom(die.id, die.rollCount)() * Math.PI * 2;
    mesh.quaternion.copy(restingQuaternion(shape, shown, yaw));
    if (die.result !== null) {
      this.setLabel(entry, die.result);
      label.visible = true;
    }
    this.dice.set(die.id, entry);
    return entry;
  }

  private placeBadge(entry: DieEntry): void {
    const shape = dieShape(entry.kind);
    if (this.seated) {
      const reach = shape.restHeight * 1.2 + LABEL_SIZE / 2;
      entry.label.position.set(this.badgeOffset.x * reach, 0, this.badgeOffset.z * reach);
    } else {
      entry.label.position.set(0, shape.restHeight + LABEL_GAP + LABEL_SIZE / 2, 0);
    }
  }

  private startTumble(id: string, entry: DieEntry, result: number, rollCount: number): void {
    const random = rollRandom(id, rollCount);
    const yaw = random() * Math.PI * 2;
    const axisAngle = random() * Math.PI * 2;
    entry.tumble = {
      elapsed: 0,
      from: entry.mesh.quaternion.clone(),
      to: restingQuaternion(dieShape(entry.kind), result, yaw),
      axis: new THREE.Vector3(Math.cos(axisAngle), 0.35, Math.sin(axisAngle)).normalize(),
      turns: 2 + Math.floor(random() * 2),
    };
    entry.result = result;
    entry.reveal = null;
    entry.label.visible = false; // no spoilers until it lands
    this.setLabel(entry, result);
  }

  private setLabel(entry: DieEntry, result: number): void {
    const material = entry.label.material;
    material.map?.dispose();
    const texture = new THREE.CanvasTexture(paintLabel(result, entry.kind, entry.body));
    texture.colorSpace = THREE.SRGBColorSpace;
    material.map = texture;
    material.needsUpdate = true;
  }

  private geometryFor(kind: DieKind): THREE.BufferGeometry {
    let geometry = this.geometries.get(kind);
    if (!geometry) {
      geometry = buildDieGeometry(dieShape(kind));
      this.geometries.set(kind, geometry);
    }
    return geometry;
  }

  /** One material (and atlas texture) per kind and color, shared by every
   * die that looks like that. */
  private materialFor(kind: DieKind, body: string): THREE.MeshPhysicalMaterial {
    const key = `${kind}|${body}`;
    let material = this.materials.get(key);
    if (!material) {
      const texture = new THREE.CanvasTexture(paintAtlas(dieShape(kind), body));
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      material = new THREE.MeshPhysicalMaterial({
        map: texture,
        // Dice only ever lie under the chandelier, which gives the table
        // several times the light the colors are authored for — scaled so
        // a top face shows its true player color instead of washing out.
        color: new THREE.Color().setScalar(DIE_ALBEDO_SCALE),
        roughness: 0.6,
        // Barely any gloss: the seated view looks down from right beside
        // that light, where a normal sheen mirrors it as a white face.
        specularIntensity: 0.12,
      });
      this.materials.set(key, material);
    }
    return material;
  }

  private removeDie(id: string): void {
    const entry = this.dice.get(id);
    if (!entry) {
      return;
    }
    this.group.remove(entry.root);
    entry.label.material.map?.dispose();
    entry.label.material.dispose();
    this.dice.delete(id);
  }
}
