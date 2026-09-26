import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  findArmRig,
  HOLDS,
  GESTURE_POSES,
  blendPose,
  gestureWeight,
  instantiateHeldItem,
  placeInHand,
  poseHold,
  releaseHold,
  type HoldPose,
} from './heldItems.js';
import { armSkeleton, FAKE_FIST, fakeGadget, punchClip } from './testRig.js';

function rigged() {
  const model = armSkeleton();
  const find = (name: string) => model.getObjectByName(name.replace('.', '')) ?? null;
  const rig = findArmRig(find, [punchClip()]);
  if (!rig) throw new Error('no rig');
  return { model, rig, find };
}

/** Where `from` points toward `to`, in the model's space. */
function direction(model: THREE.Object3D, from: THREE.Object3D, to: THREE.Object3D) {
  model.updateWorldMatrix(true, true);
  const a = model.worldToLocal(from.getWorldPosition(new THREE.Vector3()));
  const b = model.worldToLocal(to.getWorldPosition(new THREE.Vector3()));
  return b.sub(a).normalize();
}

function axisOf(model: THREE.Object3D, bone: THREE.Object3D, axis: THREE.Vector3) {
  const inModel = model.getWorldQuaternion(new THREE.Quaternion()).invert();
  return axis
    .clone()
    .applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(inModel));
}

/** Clip tracks store float32, so a round trip is only close, not equal. */
function expectSameRotation(a: THREE.Quaternion, b: THREE.Quaternion) {
  expect(Math.abs(a.dot(b))).toBeCloseTo(1, 6);
}

const POSE: HoldPose = {
  upperArm: [-0.1, -1, 0.3],
  forearm: [0.2, 0.1, 1],
  fingers: [0.2, 0.3, 1],
  palm: [0, 1, 0],
  grip: 1,
  thumb: 1,
  position: [0, 0.1, 0],
  rotation: [0, 0, 0],
};

describe('held gadgets', () => {
  it('finds the right arm and its fist, or nothing without the punching clip', () => {
    const { rig, find } = rigged();
    expect(rig.fingers).toHaveLength(16);
    expect(rig.thumb).toHaveLength(3);
    expectSameRotation(rig.fingers[0]!.fist, FAKE_FIST);
    expect(findArmRig(find, [])).toBeNull();
  });

  it('points the arm and turns the hand the way the pose says', () => {
    const { model, rig } = rigged();
    poseHold(model, rig, POSE, 1, 1);

    const near = (a: THREE.Vector3, b: number[]) =>
      expect(a.distanceTo(new THREE.Vector3(...b).normalize())).toBeLessThan(1e-6);
    near(direction(model, rig.upperArm, rig.forearm), POSE.upperArm);
    near(direction(model, rig.forearm, rig.hand), POSE.forearm);
    near(axisOf(model, rig.hand, new THREE.Vector3(0, 1, 0)), POSE.fingers);
    // The palm (the hand's -Z) faces up, as far as it can while square to the fingers.
    expect(axisOf(model, rig.hand, new THREE.Vector3(0, 0, -1)).y).toBeGreaterThan(0.9);
  });

  it('closes the hand to the fist, even while an emote has the arm', () => {
    const { model, rig } = rigged();
    const upperBefore = rig.upperArm.quaternion.clone();
    poseHold(model, rig, POSE, 0, 1);
    expect(rig.upperArm.quaternion.equals(upperBefore)).toBe(true);
    for (const { bone, fist } of [...rig.fingers, ...rig.thumb]) {
      expectSameRotation(bone.quaternion, fist);
    }
  });

  it('blends partway, for easing in and out', () => {
    const { model, rig } = rigged();
    const joint = rig.fingers[0]!;
    const start = joint.bone.quaternion.clone();
    poseHold(model, rig, POSE, 0, 0.5);
    expect(joint.bone.quaternion.angleTo(start)).toBeCloseTo(start.angleTo(joint.fist) / 2, 6);
  });

  it('puts the arm back the way the clip had it, for a mixer that only writes changes', () => {
    const { model, rig } = rigged();
    const before = rig.bones.map((bone) => bone.quaternion.clone());
    poseHold(model, rig, POSE, 1, 1);
    expect(rig.forearm.quaternion.equals(before[1]!)).toBe(false);
    releaseHold(rig);
    rig.bones.forEach((bone, index) => expect(bone.quaternion.equals(before[index]!)).toBe(true));
  });

  it('copies a gadget with its own materials, the lens and flash dark', () => {
    const source = fakeGadget();
    const { item, parts } = instantiateHeldItem(source);
    expect(parts.materials).toHaveLength(3);
    expect(parts.lens?.emissiveIntensity).toBe(0);
    expect(parts.flash?.emissiveIntensity).toBe(0);
    expect(parts.beamOrigin?.name).toBe('Lens');
    const sourceMaterials = (source.children[0] as THREE.Mesh).material as THREE.Material[];
    for (const material of parts.materials) {
      expect(sourceMaterials).not.toContain(material);
    }
    expect(item).not.toBe(source);
  });

  it('places the gadget in the hand per the pose', () => {
    const item = new THREE.Object3D();
    placeInHand(item, HOLDS.camera, HOLDS.camera.seated);
    expect(item.position.toArray()).toEqual(HOLDS.camera.seated.position);
    expect(item.scale.x).toBe(HOLDS.camera.scale);
  });

  it('has a standing and a seated hold for every gadget', () => {
    for (const hold of Object.values(HOLDS)) {
      for (const pose of [hold.standing, hold.seated]) {
        const numbers = [
          ...pose.upperArm,
          ...pose.forearm,
          ...pose.fingers,
          ...pose.palm,
          ...pose.position,
          ...pose.rotation,
          pose.grip,
          pose.thumb,
        ];
        expect(numbers.every(Number.isFinite)).toBe(true);
        expect(pose.grip).toBeGreaterThanOrEqual(0);
        expect(pose.grip).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('gestures', () => {
  it('ease up, hold and ease back down, then are over', () => {
    expect(gestureWeight('sip', 0)).toBe(0);
    expect(gestureWeight('sip', 0.2)).toBeGreaterThan(0);
    expect(gestureWeight('sip', 0.2)).toBeLessThan(1);
    expect(gestureWeight('sip', 0.7)).toBe(1);
    expect(gestureWeight('sip', 1.4)).toBeLessThan(1);
    expect(gestureWeight('sip', 5)).toBeNull();
    expect(gestureWeight('snack', 1.2)).toBeNull();
  });

  it('bend the arm toward the gesture and leave the item where it is in the hand', () => {
    const base = HOLDS.tea.standing;
    expect(blendPose(base, GESTURE_POSES.sip, 0)).toBe(base);
    const full = blendPose(base, GESTURE_POSES.sip, 1);
    const unit = (v: number[]) => v.map((x) => x / Math.hypot(...v));
    full.forearm.forEach((x, i) => expect(x).toBeCloseTo(unit(GESTURE_POSES.sip.forearm)[i]!));
    expect(full.position).toEqual(base.position);
    expect(full.rotation).toEqual(base.rotation);
    const half = blendPose(base, GESTURE_POSES.cheers, 0.5);
    expect(Math.hypot(...half.upperArm)).toBeCloseTo(1);
  });

  it('has a way to hold every drink and gadget', () => {
    for (const kind of ['tea', 'cocoa', 'camera', 'flashlight', 'walkie', 'calculator'] as const) {
      expect(HOLDS[kind].standing).toBeDefined();
      expect(HOLDS[kind].seated).toBeDefined();
    }
  });
});
