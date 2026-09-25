import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Player } from '@custom-tabletop/shared';
import { aimFlashlightBeam, FLASHLIGHT_INTENSITY } from './flashlightBeam.js';

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

describe('aimFlashlightBeam', () => {
  it('stays dark when nobody has the flashlight on', () => {
    const { beam, camera, avatar } = setup();
    beam.intensity = 3;
    aimFlashlightBeam(beam, [player('me'), player('bob')], 'me', camera, () => avatar);
    expect(beam.intensity).toBe(0);
  });

  it('shines from our camera, where we look, when we hold it', () => {
    const { beam, camera } = setup();
    aimFlashlightBeam(beam, [player('me', true)], 'me', camera, () => undefined);
    expect(beam.intensity).toBe(FLASHLIGHT_INTENSITY);
    expect(beam.position.toArray()).toEqual([1, 1.6, 2]);
    expect(beam.target.position.z).toBeCloseTo(-3);
  });

  it("shines from someone else's avatar, the way they face", () => {
    const { beam, camera, avatar } = setup();
    aimFlashlightBeam(beam, [player('me'), player('bob', true)], 'me', camera, (id) =>
      id === 'bob' ? avatar : undefined,
    );
    expect(beam.intensity).toBe(FLASHLIGHT_INTENSITY);
    expect(beam.position.x).toBeCloseTo(-2);
    expect(beam.position.y).toBeCloseTo(1.3);
    expect(beam.target.position.x).toBeCloseTo(2);
  });

  it("goes dark when the holder's avatar isn't there to shine from", () => {
    const { beam, camera, avatar } = setup();
    avatar.visible = false;
    aimFlashlightBeam(beam, [player('bob', true)], 'me', camera, () => avatar);
    expect(beam.intensity).toBe(0);
    aimFlashlightBeam(beam, [player('bob', true)], 'me', camera, () => undefined);
    expect(beam.intensity).toBe(0);
  });
});
