import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CAT_SPOTS } from './catRoutes.js';
import { RoomCat } from './RoomCat.js';

describe('the cat', () => {
  it('starts where it should be, curled up — and can be petted there', () => {
    const cat = new RoomCat(new THREE.Scene());
    cat.update(1 / 30, 'sofa', false);
    expect(cat.position.x).toBeCloseTo(CAT_SPOTS.sofa.x);
    expect(cat.position.y).toBeCloseTo(CAT_SPOTS.sofa.y);
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

  it('draws every part of her from the start (no NaN before the first stroke)', () => {
    const cat = new RoomCat(new THREE.Scene());
    cat.update(1 / 30, 'fire', false);
    cat.group.updateMatrixWorld(true);
    cat.group.traverse((node) => {
      expect(node.matrixWorld.elements.every(Number.isFinite)).toBe(true);
    });
  });

  it('is up and off at once when someone sits down where she lies', () => {
    const cat = new RoomCat(new THREE.Scene());
    cat.update(1 / 30, 'sofa', false);
    cat.update(1 / 30, 'fire', false, true);
    expect(cat.resting).toBe(false);
    for (let i = 0; i < 8; i++) cat.update(1 / 30, 'fire', false, true);
    // Already moving off the cushion, not still getting up.
    expect(
      cat.position.distanceTo(
        new THREE.Vector3(CAT_SPOTS.sofa.x, CAT_SPOTS.sofa.y, CAT_SPOTS.sofa.z),
      ),
    ).toBeGreaterThan(0.02);
  });

  it('changes course partway when her seat is taken, rather than landing in a lap', () => {
    const cat = new RoomCat(new THREE.Scene());
    cat.update(1 / 30, 'fire', false);
    // Off toward the sofa...
    for (let i = 0; i < 30 * 6; i++) cat.update(1 / 30, 'sofa', false);
    expect(cat.resting).toBe(false);
    // ...someone sits there: back to the fire, without ever reaching it.
    let highest = 0;
    for (let i = 0; i < 30 * 40; i++) {
      cat.update(1 / 30, 'fire', false);
      highest = Math.max(highest, cat.position.y);
    }
    expect(cat.restingSpot).toBe('fire');
    expect(highest).toBeLessThan(0.3);
  });

  it('comes out of the room when it goes', () => {
    const scene = new THREE.Scene();
    const cat = new RoomCat(scene);
    expect(scene.getObjectByName('room-cat')).toBeDefined();
    cat.dispose();
    expect(scene.getObjectByName('room-cat')).toBeUndefined();
  });
});
