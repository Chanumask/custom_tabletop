import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CAT_SPOTS } from './catRoutes.js';
import { RoomCat } from './RoomCat.js';

describe('the cat', () => {
  it('starts where it should be, curled up — and can be petted there', () => {
    const cat = new RoomCat(new THREE.Scene());
    cat.update(1 / 30, 'chest', false);
    expect(cat.position.x).toBeCloseTo(CAT_SPOTS.chest.x);
    expect(cat.position.y).toBeCloseTo(CAT_SPOTS.chest.y);
    expect(cat.resting).toBe(true);
    expect(cat.pet()).toBe(true);
    expect(cat.aimPoint.distanceTo(cat.position)).toBeLessThan(0.3);
  });

  it('gets up, walks over when it wants to be somewhere else, and curls up there', () => {
    const cat = new RoomCat(new THREE.Scene());
    cat.update(1 / 30, 'fire', false);
    // A moment after being petted, it stays put.
    cat.pet();
    cat.update(1 / 30, 'armchair', false);
    expect(cat.resting).toBe(true);
    for (let i = 0; i < 60; i++) cat.update(1 / 30, 'armchair', false);
    expect(cat.resting).toBe(false);
    expect(cat.pet()).toBe(false); // not while it's walking
    for (let i = 0; i < 30 * 30; i++) cat.update(1 / 30, 'armchair', false);
    expect(cat.resting).toBe(true);
    expect(cat.position.x).toBeCloseTo(CAT_SPOTS.armchair.x);
    expect(cat.position.z).toBeCloseTo(CAT_SPOTS.armchair.z);
  });

  it('comes out of the room when it goes', () => {
    const scene = new THREE.Scene();
    const cat = new RoomCat(scene);
    expect(scene.getObjectByName('room-cat')).toBeDefined();
    cat.dispose();
    expect(scene.getObjectByName('room-cat')).toBeUndefined();
  });
});
