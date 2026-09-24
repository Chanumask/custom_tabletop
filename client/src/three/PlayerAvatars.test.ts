import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Player } from '@custom-tabletop/shared';
import { PlayerAvatars } from './PlayerAvatars.js';

function makePlayer(
  id: string,
  position = { x: 0, y: 1.7, z: 0 },
  rotationY = 0,
  seated = false,
  connected = true,
): Player {
  return {
    id,
    name: id,
    character: { id, name: id },
    position,
    rotationY,
    muted: false,
    seated,
    connected,
  };
}

describe('PlayerAvatars', () => {
  it('creates an avatar for every player except the local one', () => {
    const scene = new THREE.Scene();
    const avatars = new PlayerAvatars(scene);
    const group = scene.getObjectByName('player-avatars') as THREE.Group;

    avatars.sync([makePlayer('p1'), makePlayer('p2'), makePlayer('p3')], 'p1');

    expect(group.children.map((child) => child.name).sort()).toEqual(['avatar-p2', 'avatar-p3']);
  });

  it('removes an avatar once its player is no longer in the list', () => {
    const scene = new THREE.Scene();
    const avatars = new PlayerAvatars(scene);
    const group = scene.getObjectByName('player-avatars') as THREE.Group;

    avatars.sync([makePlayer('p1'), makePlayer('p2')], 'p1');
    avatars.sync([makePlayer('p1')], 'p1');

    expect(group.children).toHaveLength(0);
  });

  it('positions a new avatar from the player snapshot it was created from', () => {
    const scene = new THREE.Scene();
    const avatars = new PlayerAvatars(scene);
    const group = scene.getObjectByName('player-avatars') as THREE.Group;

    avatars.sync([makePlayer('p1'), makePlayer('p2', { x: 2, y: 1.7, z: -3 }, 1.2)], 'p1');

    const mesh = group.getObjectByName('avatar-p2') as THREE.Mesh;
    expect(mesh.position.x).toBeCloseTo(2);
    expect(mesh.position.z).toBeCloseTo(-3);
    expect(mesh.rotation.y).toBeCloseTo(1.2);
  });

  it('updateOne moves an existing avatar without touching the player list', () => {
    const scene = new THREE.Scene();
    const avatars = new PlayerAvatars(scene);
    const group = scene.getObjectByName('player-avatars') as THREE.Group;

    avatars.sync([makePlayer('p1'), makePlayer('p2')], 'p1');
    avatars.updateOne('p2', { x: 5, y: 1.7, z: 4 }, 0.5);

    const mesh = group.getObjectByName('avatar-p2') as THREE.Mesh;
    expect(mesh.position.x).toBeCloseTo(5);
    expect(mesh.position.z).toBeCloseTo(4);
    expect(mesh.rotation.y).toBeCloseTo(0.5);
  });

  it('updateOne for an unknown player id is a silent no-op', () => {
    const scene = new THREE.Scene();
    const avatars = new PlayerAvatars(scene);
    expect(() => avatars.updateOne('ghost', { x: 0, y: 0, z: 0 }, 0)).not.toThrow();
  });

  it('a seated player is squashed shorter than a standing one', () => {
    const scene = new THREE.Scene();
    const avatars = new PlayerAvatars(scene);
    const group = scene.getObjectByName('player-avatars') as THREE.Group;

    avatars.sync([makePlayer('p1'), makePlayer('p2', { x: 0, y: 1.7, z: 0 }, 0, true)], 'p1');

    const mesh = group.getObjectByName('avatar-p2') as THREE.Mesh;
    expect(mesh.scale.y).toBeLessThan(1);
  });

  it('updateOne always applies as standing (documents why RoomView must not send player:move for a seated local player)', () => {
    const scene = new THREE.Scene();
    const avatars = new PlayerAvatars(scene);
    const group = scene.getObjectByName('player-avatars') as THREE.Group;

    avatars.sync([makePlayer('p1'), makePlayer('p2', { x: 0, y: 1.7, z: 0 }, 0, true)], 'p1');
    avatars.updateOne('p2', { x: 1, y: 1.7, z: 1 }, 0);

    const mesh = group.getObjectByName('avatar-p2') as THREE.Mesh;
    expect(mesh.scale.y).toBe(1);
  });

  it('a reconnecting player fades to a ghost, and back to solid once they return', () => {
    const scene = new THREE.Scene();
    const avatars = new PlayerAvatars(scene);
    const group = scene.getObjectByName('player-avatars') as THREE.Group;
    const origin = { x: 0, y: 1.7, z: 0 };

    avatars.sync([makePlayer('p1'), makePlayer('p2', origin, 0, false, false)], 'p1');
    const material = (group.getObjectByName('avatar-p2') as THREE.Mesh)
      .material as THREE.MeshStandardMaterial;
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBeLessThan(1);

    avatars.sync([makePlayer('p1'), makePlayer('p2', origin, 0, false, true)], 'p1');
    expect(material.opacity).toBe(1);
  });

  it('dispose removes the avatar group from the scene', () => {
    const scene = new THREE.Scene();
    const avatars = new PlayerAvatars(scene);

    avatars.sync([makePlayer('p1'), makePlayer('p2')], 'p1');
    avatars.dispose();

    expect(scene.getObjectByName('player-avatars')).toBeUndefined();
  });
});
