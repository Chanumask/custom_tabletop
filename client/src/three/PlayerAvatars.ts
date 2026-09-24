import * as THREE from 'three';
import type { Player, Vector3 } from '@custom-tabletop/shared';
import { PLAYER_EYE_HEIGHT, PLAYER_RADIUS } from './RoomLayout.js';

const AVATAR_HEIGHT = PLAYER_EYE_HEIGHT; // a rough "person-sized" placeholder, not a real character model
const AVATAR_RADIUS = PLAYER_RADIUS;
const CAPSULE_LENGTH = Math.max(AVATAR_HEIGHT - AVATAR_RADIUS * 2, 0.01);

/** Deterministic per-player color so avatars are at least distinguishable
 * from each other without needing real character models yet. */
function colorForPlayer(playerId: string): number {
  let hash = 0;
  for (let i = 0; i < playerId.length; i += 1) {
    hash = (hash * 31 + playerId.charCodeAt(i)) >>> 0;
  }
  return new THREE.Color().setHSL((hash % 360) / 360, 0.55, 0.55).getHex();
}

function createAvatarMesh(playerId: string): THREE.Mesh {
  const geometry = new THREE.CapsuleGeometry(AVATAR_RADIUS, CAPSULE_LENGTH, 4, 12);
  const material = new THREE.MeshStandardMaterial({
    color: colorForPlayer(playerId),
    roughness: 0.7,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `avatar-${playerId}`;
  return mesh;
}

// A "sitting" placeholder capsule squashes to this fraction of its standing
// height (Milestone 8's table interactable) — no seated character pose to
// animate to since avatars are still placeholder capsules, but a visibly
// shorter, lowered capsule reads as "sitting" well enough, and is what makes
// another player's seated status visible to everyone else per the M8 exit
// check (the server never moves a seated player's position, only their
// `seated` flag).
const SEATED_SCALE_Y = 0.55;

function applyTransform(
  mesh: THREE.Mesh,
  position: Vector3,
  rotationY: number,
  seated: boolean,
): void {
  const scaleY = seated ? SEATED_SCALE_Y : 1;
  mesh.scale.set(1, scaleY, 1);
  // `position` is the sender's eye/camera height; the capsule's own center
  // needs to sit at half its (possibly squashed) height above the floor
  // regardless, so it's derived from AVATAR_HEIGHT rather than trusting the
  // received y verbatim.
  mesh.position.set(
    position.x,
    position.y - PLAYER_EYE_HEIGHT + (AVATAR_HEIGHT * scaleY) / 2,
    position.z,
  );
  mesh.rotation.y = rotationY;
}

/**
 * Placeholder capsule avatars for every *other* connected player (never the
 * local player, who sees the room through their own camera instead).
 * Membership (who has an avatar at all) is driven by `sync`, called from
 * `GameState.players` on join/leave — infrequent. Live movement is driven
 * by `updateOne`, called from `player:move` broadcasts — frequent. Kept
 * separate so a join/leave doesn't require re-deriving every avatar's
 * current position from a stale GameState snapshot.
 */
export class PlayerAvatars {
  private readonly group = new THREE.Group();
  private readonly meshes = new Map<string, THREE.Mesh>();

  constructor(scene: THREE.Scene) {
    this.group.name = 'player-avatars';
    scene.add(this.group);
  }

  sync(players: Player[], selfId: string): void {
    const seen = new Set<string>();

    for (const player of players) {
      if (player.id === selfId) {
        continue;
      }
      seen.add(player.id);

      let mesh = this.meshes.get(player.id);
      if (!mesh) {
        mesh = createAvatarMesh(player.id);
        this.meshes.set(player.id, mesh);
        this.group.add(mesh);
      }
      applyTransform(mesh, player.position, player.rotationY, player.seated);
    }

    for (const [playerId, mesh] of this.meshes) {
      if (!seen.has(playerId)) {
        this.removeMesh(playerId, mesh);
      }
    }
  }

  /** `player:move` broadcasts never carry `seated` (it's not a movement
   * field) — always applies as standing. Safe in practice: a seated player
   * never sends player:move in the first place (RoomView.tsx skips the
   * emit while the local controller is seated), so this only ever runs for
   * an already-standing remote player; their seated squash, when it
   * applies, comes from `sync`'s next full-GameState broadcast instead. */
  updateOne(playerId: string, position: Vector3, rotationY: number): void {
    const mesh = this.meshes.get(playerId);
    if (mesh) {
      applyTransform(mesh, position, rotationY, false);
    }
  }

  dispose(): void {
    for (const [playerId, mesh] of this.meshes) {
      this.removeMesh(playerId, mesh);
    }
    this.group.parent?.remove(this.group);
  }

  private removeMesh(playerId: string, mesh: THREE.Mesh): void {
    this.group.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    this.meshes.delete(playerId);
  }
}
