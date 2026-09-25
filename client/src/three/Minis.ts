import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import {
  TABLE_UNITS,
  playerColorHex,
  type Player,
  type PlayerColorId,
  type Point2D,
} from '@custom-tabletop/shared';
import type { CharacterSource } from './characters.js';
import type { TableSurface } from './RoomLayout.js';
import { canvasToWorld } from './tableCoordinates.js';

/** How tall a mini stands (m) — a painted miniature, not a doll. */
const MINI_HEIGHT = 0.15;
const BASE_RADIUS = 0.042;
const BASE_HEIGHT = 0.012;
/** Lifted this much while someone carries it. */
const LIFT = 0.018;
/** Remote moves arrive ~16 times a second: ease toward them. */
const EASE_PER_SECOND = 16;
/** The pose a mini is "sculpted" in: a moment of the idle animation. */
const POSE_CLIP = 'Idle';
const POSE_TIME = 0.35;

interface MiniEntry {
  playerId: string;
  color: PlayerColorId;
  root: THREE.Group;
  base: THREE.Mesh;
  top: THREE.Mesh;
  hit: THREE.Mesh;
  figure: THREE.Object3D | null;
  target: THREE.Vector3;
  lifted: boolean;
  loadToken: number;
}

/**
 * The players' minis (docs/decisions.md, "Minis"): each one a small
 * painted-miniature version of that player's own character, on a round
 * base in their color with a brass rim. Presentation only — where they
 * stand comes from `GameState.minis`; `pick` answers which mini is under a
 * ray, for dragging.
 */
export class MiniManager {
  private readonly group = new THREE.Group();
  private readonly minis = new Map<string, MiniEntry>();
  private readonly baseGeometry = new THREE.CylinderGeometry(
    BASE_RADIUS,
    BASE_RADIUS * 1.08,
    BASE_HEIGHT,
    40,
  );
  private readonly rimGeometry = new THREE.TorusGeometry(BASE_RADIUS * 1.02, 0.0024, 8, 48);
  private readonly rimMaterial = new THREE.MeshStandardMaterial({
    color: 0xc9a15a,
    metalness: 0.85,
    roughness: 0.32,
  });
  private readonly hitGeometry = new THREE.CylinderGeometry(0.05, 0.05, MINI_HEIGHT + 0.03, 12);
  private readonly hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
  private readonly shadowGeometry = new THREE.CircleGeometry(BASE_RADIUS * 1.9, 32);
  private readonly shadowMaterial: THREE.MeshBasicMaterial;
  private readonly baseMaterials = new Map<PlayerColorId, THREE.MeshStandardMaterial>();
  private readonly topGeometry = new THREE.CircleGeometry(BASE_RADIUS * 0.97, 40);
  private readonly topMaterials = new Map<PlayerColorId, THREE.MeshBasicMaterial>();

  constructor(
    scene: THREE.Scene,
    private readonly characters: CharacterSource,
    private readonly table: TableSurface,
  ) {
    this.group.name = 'minis';
    this.shadowMaterial = new THREE.MeshBasicMaterial({
      map: makeContactShadow(),
      transparent: true,
      depthWrite: false,
    });
    scene.add(this.group);
  }

  sync(minis: Record<string, Point2D>, players: Player[]): void {
    for (const id of [...this.minis.keys()]) {
      if (!minis[id] || !players.some((player) => player.id === id)) this.remove(id);
    }
    for (const [playerId, point] of Object.entries(minis)) {
      const player = players.find((candidate) => candidate.id === playerId);
      if (!player) continue;
      let entry = this.minis.get(playerId);
      const at = this.toWorld(point);
      if (!entry) {
        entry = this.create(player);
        entry.root.position.copy(at);
      } else if (entry.color !== player.color) {
        entry.color = player.color;
        entry.base.material = this.baseMaterial(player.color);
        entry.top.material = this.topMaterial(player.color);
        this.loadFigure(entry);
      }
      entry.target.copy(at);
    }
  }

  /** A local drag: the mini follows the pointer at once, lifted. */
  carry(playerId: string, point: Point2D): void {
    const entry = this.minis.get(playerId);
    if (!entry) return;
    entry.target.copy(this.toWorld(point));
    entry.root.position.x = entry.target.x;
    entry.root.position.z = entry.target.z;
    entry.lifted = true;
  }

  /** Set it back down after a drag. */
  release(playerId: string): void {
    const entry = this.minis.get(playerId);
    if (entry) entry.lifted = false;
  }

  /** Whose mini is under the ray, or null. */
  pick(raycaster: THREE.Raycaster): string | null {
    const hits = raycaster.intersectObjects(
      [...this.minis.values()].map((entry) => entry.hit),
      false,
    );
    const hit = hits[0];
    if (!hit) return null;
    for (const entry of this.minis.values()) {
      if (entry.hit === hit.object) return entry.playerId;
    }
    return null;
  }

  update(deltaSeconds: number): void {
    const t = 1 - Math.exp(-deltaSeconds * EASE_PER_SECOND);
    for (const entry of this.minis.values()) {
      const lift = entry.lifted ? LIFT : 0;
      entry.root.position.x += (entry.target.x - entry.root.position.x) * t;
      entry.root.position.z += (entry.target.z - entry.root.position.z) * t;
      entry.root.position.y += (entry.target.y + lift - entry.root.position.y) * t;
    }
  }

  dispose(): void {
    for (const id of [...this.minis.keys()]) this.remove(id);
    this.group.removeFromParent();
    this.baseGeometry.dispose();
    this.rimGeometry.dispose();
    this.rimMaterial.dispose();
    this.hitGeometry.dispose();
    this.hitMaterial.dispose();
    this.shadowGeometry.dispose();
    this.shadowMaterial.map?.dispose();
    this.shadowMaterial.dispose();
    this.baseMaterials.forEach((material) => material.dispose());
    this.topGeometry.dispose();
    this.topMaterials.forEach((material) => material.dispose());
  }

  private toWorld(point: Point2D): THREE.Vector3 {
    const at = canvasToWorld(point, this.table, TABLE_UNITS);
    return new THREE.Vector3(at.x, at.y, at.z);
  }

  /** The base's top, unlit in the player's exact color: the table's light
   * would otherwise wash it to white from straight above. */
  private topMaterial(color: PlayerColorId): THREE.MeshBasicMaterial {
    let material = this.topMaterials.get(color);
    if (!material) {
      material = new THREE.MeshBasicMaterial({ color: playerColorHex(color), toneMapped: false });
      this.topMaterials.set(color, material);
    }
    return material;
  }

  private baseMaterial(color: PlayerColorId): THREE.MeshStandardMaterial {
    let material = this.baseMaterials.get(color);
    if (!material) {
      // A glow of its own color, so the base reads as that player's even
      // under the table's bright light and from straight above.
      material = new THREE.MeshStandardMaterial({
        color: playerColorHex(color),
        emissive: playerColorHex(color),
        emissiveIntensity: 0.45,
        roughness: 0.55,
        metalness: 0.05,
      });
      this.baseMaterials.set(color, material);
    }
    return material;
  }

  private create(player: Player): MiniEntry {
    const root = new THREE.Group();
    const shadow = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.0015;
    shadow.renderOrder = 1;
    const base = new THREE.Mesh(this.baseGeometry, this.baseMaterial(player.color));
    base.position.y = BASE_HEIGHT / 2;
    const top = new THREE.Mesh(this.topGeometry, this.topMaterial(player.color));
    top.rotation.x = -Math.PI / 2;
    top.position.y = BASE_HEIGHT + 0.0006;
    const rim = new THREE.Mesh(this.rimGeometry, this.rimMaterial);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = BASE_HEIGHT;
    const hit = new THREE.Mesh(this.hitGeometry, this.hitMaterial);
    hit.position.y = (MINI_HEIGHT + 0.03) / 2;
    root.add(shadow, base, top, rim, hit);
    this.group.add(root);
    const entry: MiniEntry = {
      playerId: player.id,
      color: player.color,
      root,
      base,
      top,
      hit,
      figure: null,
      target: new THREE.Vector3(),
      lifted: false,
      loadToken: 0,
    };
    this.minis.set(player.id, entry);
    this.loadFigure(entry);
    return entry;
  }

  /** The player's own character, posed, tinted and scaled to a mini. */
  private loadFigure(entry: MiniEntry): void {
    const token = ++entry.loadToken;
    const color = entry.color;
    void this.characters.load(color).then((asset) => {
      if (token !== entry.loadToken || !this.minis.has(entry.playerId)) return;
      if (entry.figure) {
        entry.root.remove(entry.figure);
        disposeFigure(entry.figure);
      }
      const figure = cloneSkinned(asset.scene);
      figure.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          const material = (node.material as THREE.MeshStandardMaterial).clone();
          if (material.name === 'Shirt') material.color.set(playerColorHex(color));
          // Painted-miniature finish: a touch less shiny than the full-size.
          material.roughness = Math.min(1, material.roughness + 0.15);
          node.material = material;
          node.frustumCulled = false;
        }
      });
      const clip = asset.animations.find((candidate) => candidate.name === POSE_CLIP);
      if (clip) {
        const mixer = new THREE.AnimationMixer(figure);
        mixer.clipAction(clip).play();
        mixer.update(POSE_TIME);
      }
      const box = new THREE.Box3().setFromObject(figure, true);
      const height = box.max.y - box.min.y || 1.8;
      const scale = MINI_HEIGHT / height;
      figure.scale.setScalar(scale);
      figure.position.y = BASE_HEIGHT - box.min.y * scale;
      entry.figure = figure;
      entry.root.add(figure);
    });
  }

  private remove(playerId: string): void {
    const entry = this.minis.get(playerId);
    if (!entry) return;
    entry.loadToken += 1;
    if (entry.figure) disposeFigure(entry.figure);
    entry.root.removeFromParent();
    this.minis.delete(playerId);
  }
}

function disposeFigure(figure: THREE.Object3D): void {
  figure.traverse((node) => {
    if (node instanceof THREE.Mesh) (node.material as THREE.Material).dispose();
  });
}

/** A soft round shadow that grounds a mini on the table. */
function makeContactShadow(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    gradient.addColorStop(0.55, 'rgba(0, 0, 0, 0.25)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}
