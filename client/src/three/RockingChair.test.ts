import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LOUNGE_SPOTS } from './loungeSeats.js';
import { RockingChair, rockAngle } from './RockingChair.js';

function chairInRoom() {
  const root = new THREE.Group();
  const chair = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1, 0.8));
  chair.name = 'Rockingchair_01';
  chair.position.set(-3.5, 0.5, -1);
  root.add(chair);
  const creaks: number[] = [];
  const rocking = new RockingChair(root, LOUNGE_SPOTS['rocking-chair'], (amount) =>
    creaks.push(amount),
  );
  return { chair, rocking, creaks };
}

describe('the rocking chair', () => {
  it('rocks a few degrees each way', () => {
    expect(rockAngle(Math.PI / 2, 1)).toBeCloseTo(0.075);
    expect(rockAngle(-Math.PI / 2, 1)).toBeCloseTo(-0.075);
    expect(rockAngle(Math.PI / 2, 0)).toBe(0);
  });

  it('stays still until someone sits in it, then rocks and creaks', () => {
    const { chair, rocking, creaks } = chairInRoom();
    // Hanging it from its pivot doesn't move it.
    const start = chair.getWorldPosition(new THREE.Vector3());
    expect(start.x).toBeCloseTo(-3.5);
    expect(start.z).toBeCloseTo(-1);
    for (let i = 0; i < 60; i++) rocking.update(1 / 30, false);
    expect(rocking.angle).toBe(0);
    let widest = 0;
    for (let i = 0; i < 300; i++) {
      rocking.update(1 / 30, true);
      widest = Math.max(widest, Math.abs(rocking.angle));
    }
    expect(widest).toBeGreaterThan(0.06);
    expect(creaks.length).toBeGreaterThan(4);
  });

  it('slows to a stop after they get up', () => {
    const { rocking } = chairInRoom();
    for (let i = 0; i < 150; i++) rocking.update(1 / 30, true);
    for (let i = 0; i < 30; i++) rocking.update(1 / 30, false);
    let late = 0;
    for (let i = 0; i < 30; i++) {
      rocking.update(1 / 30, false);
      late = Math.max(late, Math.abs(rocking.angle));
    }
    expect(late).toBeGreaterThan(0); // still easing down a second later...
    for (let i = 0; i < 150; i++) rocking.update(1 / 30, false);
    expect(rocking.angle).toBe(0); // ...and still in the end
  });
});
