import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Player } from '@custom-tabletop/shared';
import { aimFlashlightBeam, FLASHLIGHT_INTENSITY, type BeamSources } from './flashlightBeam.js';

const player = (id: string, flashlightOn = false) => ({ id, flashlightOn }) as Player;

function setup() {
  const beam = new THREE.SpotLight();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(1, 1.6, 2);
  camera.lookAt(1, 1.6, -5);
  camera.updateMatrixWorld();
  const avatar = new THREE.Group();
  avatar.position.set(-2, 0, 0);
  avatar.rotation.y = Math.PI / 2; // facing +X
  return { beam, camera, avatar };
}

/** Bob's avatar; the flashlight's glass in his hand only if `lens` is given. */
const bob = (avatar: THREE.Object3D, lens?: THREE.Object3D): BeamSources => ({
  avatarOf: (id) => (id === 'bob' ? avatar : undefined),
  lensOf: (id) => (id === 'bob' ? lens : undefined),
});

describe('aimFlashlightBeam', () => {
  it('stays dark when nobody has the flashlight on', () => {
    const { beam, camera, avatar } = setup();
    beam.intensity = 3;
    aimFlashlightBeam(beam, [player('me'), player('bob')], 'me', camera, bob(avatar));
    expect(beam.intensity).toBe(0);
  });

  it('shines from our camera, where we look, when we hold it', () => {
    const { beam, camera, avatar } = setup();
    aimFlashlightBeam(beam, [player('me', true)], 'me', camera, bob(avatar));
    expect(beam.intensity).toBe(FLASHLIGHT_INTENSITY);
    expect(beam.position.toArray()).toEqual([1, 1.6, 2]);
    expect(beam.target.position.z).toBeCloseTo(-3);
  });

  it("shines from the flashlight in someone else's hand, the way it points", () => {
    const { beam, camera, avatar } = setup();
    // The glass at hand height, the flashlight pointing ahead and down.
    const lens = new THREE.Object3D();
    lens.position.set(0.2, 0.9, 0.3);
    lens.lookAt(0.2, 0.4, 1.3); // Object3D.lookAt turns +Z toward the target
    avatar.add(lens);
    aimFlashlightBeam(beam, [player('me'), player('bob', true)], 'me', camera, bob(avatar, lens));

    expect(beam.intensity).toBe(FLASHLIGHT_INTENSITY);
    const glass = lens.getWorldPosition(new THREE.Vector3());
    expect(beam.position.distanceTo(glass)).toBeLessThan(1e-9);
    const aim = beam.target.position.clone().sub(beam.position).normalize();
    // Bob faces +X: ahead is +X, and the beam tips down.
    expect(aim.x).toBeGreaterThan(0.8);
    expect(aim.y).toBeLessThan(-0.3);
  });

  it('falls back to their chest until the flashlight is in their hand', () => {
    const { beam, camera, avatar } = setup();
    aimFlashlightBeam(beam, [player('me'), player('bob', true)], 'me', camera, bob(avatar));
    expect(beam.intensity).toBe(FLASHLIGHT_INTENSITY);
    expect(beam.position.x).toBeCloseTo(-2);
    expect(beam.position.y).toBeCloseTo(1.3);
    expect(beam.target.position.x).toBeCloseTo(2);
  });

  it("goes dark when the holder's avatar isn't there to shine from", () => {
    const { beam, camera, avatar } = setup();
    avatar.visible = false;
    aimFlashlightBeam(beam, [player('bob', true)], 'me', camera, bob(avatar));
    expect(beam.intensity).toBe(0);
    aimFlashlightBeam(beam, [player('bob', true)], 'me', camera, {
      avatarOf: () => undefined,
      lensOf: () => undefined,
    });
    expect(beam.intensity).toBe(0);
  });
});
