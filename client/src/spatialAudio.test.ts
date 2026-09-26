import { describe, expect, it } from 'vitest';
import { placeSound } from './spatialAudio.js';

describe('placeSound', () => {
  const facingNorth = { x: 0, z: 0, yaw: Math.PI }; // looking toward -z

  it('is full volume up close and silent past the far distance', () => {
    expect(placeSound(facingNorth, { x: 0, z: -0.5 }).volume).toBe(1);
    expect(placeSound(facingNorth, { x: 0, z: -9 }).volume).toBe(0);
    const middle = placeSound(facingNorth, { x: 0, z: -4.5 }).volume;
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(1);
  });

  it('sounds from the right side when it is on the right', () => {
    // Facing -z, your right is -x.
    expect(placeSound(facingNorth, { x: -3, z: 0 }).pan).toBeGreaterThan(0.5);
    expect(placeSound(facingNorth, { x: 3, z: 0 }).pan).toBeLessThan(-0.5);
    expect(Math.abs(placeSound(facingNorth, { x: 0, z: -3 }).pan)).toBeLessThan(1e-9);
  });

  it('never pans all the way to one ear', () => {
    expect(Math.abs(placeSound(facingNorth, { x: -3, z: 0 }).pan)).toBeLessThanOrEqual(0.8);
  });
});
