import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FirstPersonController, SEATED_EYE_HEIGHT } from './FirstPersonController.js';

/** PointerLockControls only needs somewhere to hang its document listeners. */
const fakeElement = {
  ownerDocument: {
    addEventListener() {},
    removeEventListener() {},
    exitPointerLock() {},
  },
} as unknown as HTMLElement;

const table = { center: { x: 0, z: 0 }, halfWidth: 1, halfDepth: 1, height: 0.78 };

function standingController() {
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
  camera.position.set(0.4, 1.7, 3);
  const controller = new FirstPersonController({
    camera,
    domElement: fakeElement,
    room: { minX: -5, maxX: 5, minZ: -4, maxZ: 4 },
    obstacles: [],
    table,
  });
  return { camera, controller };
}

const forward = (camera: THREE.Camera) => camera.getWorldDirection(new THREE.Vector3());

describe('FirstPersonController seated views', () => {
  it('sits on the chair at seated eye height, facing the table', () => {
    const { camera, controller } = standingController();
    controller.sit({ x: 0, z: 1.5, yaw: Math.PI });

    expect(controller.seatedView).toBe('chair');
    expect(camera.position.y).toBeCloseTo(SEATED_EYE_HEIGHT);
    expect(camera.position.z).toBeGreaterThan(1.3);
    expect(camera.position.z).toBeLessThan(1.5);
    const look = forward(camera);
    expect(look.z).toBeLessThan(-0.8); // toward the table's center...
    expect(look.y).toBeLessThan(0); // ...and a little down at it
  });

  it('switches to the table view and back, then stands exactly where it was', () => {
    const { camera, controller } = standingController();
    const standing = camera.position.clone();
    controller.sit({ x: 0, z: 1.5, yaw: Math.PI });

    controller.setSeatedView('table');
    expect(controller.seatedView).toBe('table');
    expect(camera.position.x).toBeCloseTo(0);
    expect(camera.position.z).toBeCloseTo(0);
    expect(forward(camera).y).toBeCloseTo(-1); // straight down

    controller.setSeatedView('chair');
    expect(camera.position.y).toBeCloseTo(SEATED_EYE_HEIGHT);

    controller.stand();
    expect(controller.seatedView).toBeNull();
    expect(camera.position.toArray()).toEqual(standing.toArray());
  });

  it('without a free chair, sits in the table view only', () => {
    const { controller } = standingController();
    controller.sit(null);
    expect(controller.seatedView).toBe('table');
    expect(controller.hasChair).toBe(false);
    controller.setSeatedView('chair');
    expect(controller.seatedView).toBe('table');
  });

  it('never walks while seated, even while looking around', () => {
    const { camera, controller } = standingController();
    controller.sit({ x: 0, z: 1.5, yaw: Math.PI });
    const seatedAt = camera.position.clone();
    controller.controls.isLocked = true;
    (controller as unknown as { pressedKeys: Set<string> }).pressedKeys.add('KeyW');

    controller.update(1);
    expect(camera.position.toArray()).toEqual(seatedAt.toArray());
  });
});

describe('FirstPersonController on the sofa and the chairs', () => {
  it('sits with mouse-look still on, and gets up where it stood', () => {
    const { camera, controller } = standingController();
    const standing = camera.position.clone();
    controller.lounge({ x: 2, y: 1.15, z: -3.4 }, 0);
    expect(controller.isLounging).toBe(true);
    expect(controller.isSeated).toBe(false);
    expect(camera.position.toArray()).toEqual([2, 1.15, -3.4]);
    const look = forward(camera);
    expect(look.z).toBeGreaterThan(0.9); // the seat's way...
    expect(look.y).toBeLessThan(0); // ...a little down
    controller.setLoungeEye({ x: 2, y: 1.14, z: -3.3 });
    expect(camera.position.z).toBeCloseTo(-3.3);
    controller.getUp();
    expect(controller.isLounging).toBe(false);
    expect(camera.position.distanceTo(standing)).toBeCloseTo(0);
  });

  it('never walks while sitting there', () => {
    const { camera, controller } = standingController();
    controller.lounge({ x: 2, y: 1.15, z: -3.4 }, 0);
    Object.defineProperty(controller.controls, 'isLocked', { get: () => true });
    controller.update(0.5);
    expect(camera.position.toArray()).toEqual([2, 1.15, -3.4]);
  });
});
