import * as THREE from 'three';
import type { Drink, Gesture, ItemKind } from '@custom-tabletop/shared';

/** Anything held in the hand: a gadget from the chest, or a drink. */
export type HeldKind = ItemKind | Drink;

type Vec3 = [number, number, number];

/**
 * How a character holds a gadget in their right hand (docs/decisions.md,
 * "Gadget models"). The characters have no carrying animations, so the arm
 * is posed on top of whatever clip is playing, the same way sitting poses
 * the legs.
 *
 * Arm directions are in the character's own space: it faces +Z, +Y is up,
 * and its right is -X. The item's placement is in the hand bone's space
 * (Wrist.R: the fingers point +Y, the thumb is on the -X side and the palm
 * faces -Z), so it holds for all eight characters.
 */
export interface HoldPose {
  /** Where the upper arm and the forearm point. */
  upperArm: Vec3;
  forearm: Vec3;
  /** Where the fingers point, and which way the palm faces. */
  fingers: Vec3;
  palm: Vec3;
  /** How far the fingers, and the thumb, close toward a fist (0 as the
   * animation has them, 1 the characters' own punching fist). */
  grip: number;
  thumb: number;
  /** The gadget in the hand bone's space. */
  position: Vec3;
  rotation: Vec3;
}

export interface Hold {
  standing: HoldPose;
  /** At the table: above it, where the others can see. */
  seated: HoldPose;
  scale: number;
}

/** Rotations as successive turns about the hand's own axes. */
function turns(...steps: [axis: 'x' | 'y' | 'z', degrees: number][]): Vec3 {
  const quaternion = new THREE.Quaternion();
  for (const [axis, degrees] of steps) {
    const unit = new THREE.Vector3(
      axis === 'x' ? 1 : 0,
      axis === 'y' ? 1 : 0,
      axis === 'z' ? 1 : 0,
    );
    quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(unit, (degrees * Math.PI) / 180));
  }
  const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
  return [euler.x, euler.y, euler.z];
}

/** The item's orientation in the hand from where its own +X and +Y end up
 * (hand space); its +Z follows. */
function axes(x: Vec3, y: Vec3): Vec3 {
  const ax = new THREE.Vector3(...x).normalize();
  const ay = new THREE.Vector3(...y).normalize();
  const az = new THREE.Vector3().crossVectors(ax, ay);
  const euler = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(ax, ay, az));
  return [euler.x, euler.y, euler.z];
}

/** A fist around a handle: the gadget runs through it, out past the thumb. */
const FIST = { grip: 0.8, thumb: 0.8, position: [0.01, 0.12, -0.035] as Vec3 };

/** An open hand, palm up, the gadget resting on it. */
const OPEN = { palm: [0, 1, 0] as Vec3, grip: 0.25, thumb: 0.1 };

/** A mug by its handle: the fingers through it, the thumb on top, the mug
 * upright on the palm's side (its handle toward the back of the hand). */
const MUG_GRIP = {
  grip: 0.85,
  thumb: 0.65,
  position: [0.004, 0.085, -0.028] as Vec3,
  rotation: axes([0, 0, 1], [-1, 0, 0]),
};

/** A drink held in front, to sip from and raise to the others. */
const MUG_HOLD: Hold = {
  standing: {
    ...MUG_GRIP,
    upperArm: [-0.2, -0.88, 0.32],
    forearm: [0.3, 0.5, 0.95],
    fingers: [0.2, 0.05, 1],
    palm: [1, 0, 0],
  },
  seated: {
    ...MUG_GRIP,
    upperArm: [-0.14, -0.62, 0.78],
    forearm: [0.25, 0.42, 1],
    fingers: [0.2, 0.25, 1],
    palm: [1, 0, 0],
  },
  scale: 1,
};

// Tuned by eye in the running room against the blue and red characters
// (one of each rig), standing, walking and sitting at the table.
export const HOLDS: Record<HeldKind, Hold> = {
  tea: MUG_HOLD,
  cocoa: MUG_HOLD,
  // Carried low at the side, lighting the floor ahead; at the table, the
  // fist rests at the edge and lights the map.
  flashlight: {
    standing: {
      ...FIST,
      upperArm: [-0.2, -1, 0.1],
      forearm: [-0.1, -0.9, 0.42],
      fingers: [-0.05, -0.93, 0.35],
      palm: [1, 0, 0],
      // Tipped a little toward the fingers: it points ahead, not up.
      rotation: turns(['z', -35], ['y', -90]),
    },
    seated: {
      ...FIST,
      upperArm: [-0.12, -0.45, 0.88],
      forearm: [0, 0.55, 0.85],
      fingers: [0, -0.8, 0.6],
      palm: [1, 0, 0],
      // Steeper: from just above the table, down onto the map.
      rotation: turns(['z', -70], ['y', -90]),
    },
    scale: 1.25,
  },
  // Up by the chest, screen toward its holder.
  walkie: {
    standing: {
      ...FIST,
      upperArm: [-0.2, -0.97, 0.15],
      forearm: [0.3, 0.3, 0.9],
      fingers: [0.15, 0.35, 0.92],
      palm: [1, 0, -0.35],
      rotation: turns(['x', 125], ['z', 90]),
    },
    seated: {
      ...FIST,
      upperArm: [-0.2, -0.8, 0.55],
      forearm: [0.3, 0.55, 0.8],
      fingers: [0.15, 0.55, 0.82],
      palm: [1, 0, -0.35],
      rotation: turns(['x', 125], ['z', 90]),
    },
    scale: 1.15,
  },
  // On the palm, tipped up to be read; the thumb along its edge.
  calculator: {
    standing: {
      ...OPEN,
      upperArm: [-0.14, -1, 0.3],
      forearm: [0.28, 0.12, 1],
      fingers: [0.3, 0.3, 1],
      palm: [0, 1, -0.45],
      grip: 0.12,
      thumb: 0.25,
      position: [0.022, 0.06, -0.028],
      rotation: turns(['y', 180]),
    },
    seated: {
      ...OPEN,
      upperArm: [-0.12, -0.62, 0.78],
      forearm: [0.28, 0.45, 1],
      fingers: [0.3, 0.55, 1],
      palm: [0, 1, -0.6],
      grip: 0.12,
      thumb: 0.25,
      position: [0.022, 0.06, -0.028],
      rotation: turns(['y', 180]),
    },
    scale: 1.3,
  },
  // Upright on the palm at chest height, lens forward, ready to shoot.
  camera: {
    standing: {
      ...OPEN,
      upperArm: [-0.16, -1, 0.12],
      forearm: [0.22, 0.28, 1],
      fingers: [0.12, 0.15, 1],
      position: [0, 0.09, -0.07],
      rotation: turns(['x', -90]),
    },
    seated: {
      ...OPEN,
      upperArm: [-0.14, -0.8, 0.55],
      forearm: [0.2, 0.3, 1],
      fingers: [0.1, 0.18, 1],
      position: [0, 0.09, -0.07],
      rotation: turns(['x', -90]),
    },
    scale: 0.92,
  },
};

/** What the arm does for a gesture (refreshments.ts), from whatever it was
 * doing: the mug up to the lips, raised to the others, a hand to the mouth
 * with a bit of popcorn. The item stays where it is in the hand. */
type ArmPose = Pick<HoldPose, 'upperArm' | 'forearm' | 'fingers' | 'palm' | 'grip' | 'thumb'>;

export const GESTURE_POSES: Record<Gesture, ArmPose> = {
  // The thumb (the mug's top) tips back toward the face.
  sip: {
    upperArm: [-0.12, -0.55, 0.5],
    forearm: [0.3, 0.85, 0.3],
    fingers: [0, 0.6, 0.8],
    palm: [1, 0, 0],
    grip: 0.85,
    thumb: 0.65,
  },
  // Up and out toward everyone, the arm nearly straight, the mug tipped a
  // little forward.
  cheers: {
    upperArm: [-0.08, 0.32, 1],
    forearm: [-0.02, 0.5, 1],
    fingers: [0, -0.3, 0.9],
    palm: [1, 0, 0],
    grip: 0.85,
    thumb: 0.65,
  },
  // Up to the mouth, palm in, fingers loosely closed round the popcorn.
  snack: {
    upperArm: [-0.05, -0.5, 0.45],
    forearm: [0.4, 0.85, 0.15],
    fingers: [0.35, 0.9, 0.1],
    palm: [0, 0, -1],
    grip: 0.45,
    thumb: 0.3,
  },
};

/** How long each gesture takes (seconds): up, held, back down. */
const GESTURE_TIMES: Record<Gesture, [up: number, hold: number, down: number]> = {
  sip: [0.35, 0.8, 0.4],
  cheers: [0.3, 1, 0.4],
  snack: [0.3, 0.35, 0.35],
};

/** How far into its pose a gesture is, `elapsed` seconds in (0..1), or
 * null once it's over. Pure. */
export function gestureWeight(gesture: Gesture, elapsed: number): number | null {
  const [up, hold, down] = GESTURE_TIMES[gesture];
  if (elapsed < 0) return 0;
  const ease = (t: number) => t * t * (3 - 2 * t);
  if (elapsed < up) return ease(elapsed / up);
  if (elapsed < up + hold) return 1;
  if (elapsed < up + hold + down) return ease(1 - (elapsed - up - hold) / down);
  return null;
}

const blendA = new THREE.Vector3();
const blendB = new THREE.Vector3();
function blendDirection(a: Vec3, b: Vec3, t: number): Vec3 {
  blendA.set(...a).normalize();
  blendB.set(...b).normalize();
  blendA.lerp(blendB, t);
  if (blendA.lengthSq() < 1e-6) blendA.set(...b);
  blendA.normalize();
  return [blendA.x, blendA.y, blendA.z];
}

/** `pose`, `t` of the way to the gesture's arm (the item stays in hand). */
export function blendPose(pose: HoldPose, gesture: ArmPose, t: number): HoldPose {
  if (t <= 0) return pose;
  return {
    ...pose,
    upperArm: blendDirection(pose.upperArm, gesture.upperArm, t),
    forearm: blendDirection(pose.forearm, gesture.forearm, t),
    fingers: blendDirection(pose.fingers, gesture.fingers, t),
    palm: blendDirection(pose.palm, gesture.palm, t),
    grip: pose.grip + (gesture.grip - pose.grip) * t,
    thumb: pose.thumb + (gesture.thumb - pose.thumb) * t,
  };
}

/** The snack gesture with nothing in hand: the arm alone. */
export const EMPTY_HAND_SNACK: HoldPose = {
  ...GESTURE_POSES.snack,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
};

/** A finger or thumb bone and how it sits in the characters' own fist. */
interface FistJoint {
  bone: THREE.Object3D;
  fist: THREE.Quaternion;
}

/** The right arm's bones, found once per character model. */
export interface ArmRig {
  upperArm: THREE.Object3D;
  forearm: THREE.Object3D;
  hand: THREE.Object3D;
  fingers: FistJoint[];
  thumb: FistJoint[];
  /** Every bone a hold turns, and how the clip had each one before it
   * did — see `releaseHold`. */
  bones: THREE.Object3D[];
  animated: THREE.Quaternion[];
  posed: boolean;
}

const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];
/** The clip whose (static) right hand is a closed fist. */
const FIST_CLIP = 'Punch_Right';

/** The rig's right arm, with its fist read from the punching clip — or
 * null if this model lacks any of it. */
export function findArmRig(
  find: (name: string) => THREE.Object3D | null,
  clips: THREE.AnimationClip[],
): ArmRig | null {
  const upperArm = find('UpperArm.R');
  const forearm = find('LowerArm.R');
  const hand = find('Wrist.R');
  const punch = clips.find((clip) => clip.name === FIST_CLIP);
  if (!upperArm || !forearm || !hand || !punch) {
    return null;
  }
  const joint = (name: string): FistJoint | null => {
    const bone = find(name);
    const track = bone && punch.tracks.find((t) => t.name === `${bone.name}.quaternion`);
    if (!bone || !track || track.values.length < 4) {
      return null;
    }
    const [x = 0, y = 0, z = 0, w = 1] = track.values;
    return { bone, fist: new THREE.Quaternion(x, y, z, w) };
  };
  const fingers = FINGERS.flatMap((finger) => [1, 2, 3, 4].map((n) => joint(`${finger}${n}.R`)));
  const thumb = [1, 2, 3].map((n) => joint(`Thumb${n}.R`));
  if (fingers.some((j) => !j) || thumb.some((j) => !j)) {
    return null;
  }
  const joints = [...(fingers as FistJoint[]), ...(thumb as FistJoint[])];
  const bones = [upperArm, forearm, hand, ...joints.map((j) => j.bone)];
  return {
    upperArm,
    forearm,
    hand,
    fingers: fingers as FistJoint[],
    thumb: thumb as FistJoint[],
    bones,
    animated: bones.map(() => new THREE.Quaternion()),
    posed: false,
  };
}

/**
 * Puts the arm back the way the clip had it. Call it before every mixer
 * update: the mixer only writes a bone when its clip's value *changes*, so
 * wherever a clip holds a bone still (the idle hand's fingers), a hold's
 * pose would otherwise stay after the gadget went back in the chest.
 */
export function releaseHold(rig: ArmRig): void {
  if (!rig.posed) {
    return;
  }
  rig.bones.forEach((bone, index) => bone.quaternion.copy(rig.animated[index]!));
  rig.posed = false;
}

const modelQuat = new THREE.Quaternion();
const parentQuat = new THREE.Quaternion();
const boneQuat = new THREE.Quaternion();
const delta = new THREE.Quaternion();
const posed = new THREE.Quaternion();
const from = new THREE.Vector3();
const to = new THREE.Vector3();
const start = new THREE.Vector3();
const axisY = new THREE.Vector3();
const axisZ = new THREE.Vector3();
const axisX = new THREE.Vector3();
const basis = new THREE.Matrix4();

/** Turns `bone` (keeping its roll) so it points from itself toward
 * `direction` (character space), `weight` of the way from the clip's pose. */
function aim(
  model: THREE.Object3D,
  bone: THREE.Object3D,
  child: THREE.Object3D,
  direction: Vec3,
  weight: number,
): void {
  if (!bone.parent) {
    return;
  }
  bone.updateWorldMatrix(true, true);
  bone.getWorldPosition(start);
  child.getWorldPosition(from).sub(start).normalize();
  to.set(...direction)
    .normalize()
    .applyQuaternion(model.getWorldQuaternion(modelQuat));
  delta.setFromUnitVectors(from, to);
  bone.parent.getWorldQuaternion(parentQuat);
  // local' = parent⁻¹ · delta · parent · local
  posed.copy(parentQuat).invert().multiply(delta).multiply(parentQuat).multiply(bone.quaternion);
  bone.quaternion.slerp(posed, weight);
}

/** Sets the hand's whole orientation from where its fingers point and
 * which way its palm faces (character space). */
function orientHand(
  model: THREE.Object3D,
  hand: THREE.Object3D,
  fingers: Vec3,
  palm: Vec3,
  weight: number,
): void {
  if (!hand.parent) {
    return;
  }
  model.getWorldQuaternion(modelQuat);
  axisY
    .set(...fingers)
    .normalize()
    .applyQuaternion(modelQuat);
  // The palm faces the bone's -Z: +Z is the back of the hand.
  axisZ
    .set(...palm)
    .negate()
    .applyQuaternion(modelQuat);
  axisZ.addScaledVector(axisY, -axisZ.dot(axisY)).normalize();
  axisX.crossVectors(axisY, axisZ);
  boneQuat.setFromRotationMatrix(basis.makeBasis(axisX, axisY, axisZ));
  hand.parent.updateWorldMatrix(true, false);
  hand.parent.getWorldQuaternion(parentQuat);
  posed.copy(parentQuat).invert().multiply(boneQuat);
  hand.quaternion.slerp(posed, weight);
}

/** Poses the right arm and hand for `pose`, `arm` of the way over whatever
 * the animation mixer just set, and closes the fingers `grip` of the way.
 * They're separate so an emote can have the arm while the hand keeps hold
 * of the gadget. Call it after the mixer update, every frame. */
export function poseHold(
  model: THREE.Object3D,
  rig: ArmRig,
  pose: HoldPose,
  arm: number,
  grip: number,
): void {
  if (arm <= 0 && grip <= 0) {
    return;
  }
  rig.bones.forEach((bone, index) => rig.animated[index]!.copy(bone.quaternion));
  rig.posed = true;
  if (arm > 0) {
    aim(model, rig.upperArm, rig.forearm, pose.upperArm, arm);
    aim(model, rig.forearm, rig.hand, pose.forearm, arm);
    orientHand(model, rig.hand, pose.fingers, pose.palm, arm);
  }
  if (grip > 0) {
    for (const { bone, fist } of rig.fingers) {
      bone.quaternion.slerp(fist, pose.grip * grip);
    }
    for (const { bone, fist } of rig.thumb) {
      bone.quaternion.slerp(fist, pose.thumb * grip);
    }
  }
}

/** Places a held gadget in the hand, per its `Hold`. */
export function placeInHand(item: THREE.Object3D, hold: Hold, pose: HoldPose): void {
  item.position.set(...pose.position);
  item.rotation.set(...pose.rotation);
  item.scale.setScalar(hold.scale);
}

/** Materials the avatar code drives, looked up by the names the Blender
 * build gives them (blender/gadgets.py). */
export interface HeldItemParts {
  materials: THREE.MeshStandardMaterial[];
  /** The flashlight's glass, lit while it's on. */
  lens: THREE.MeshStandardMaterial | null;
  /** The camera's flash window, which pops when a photo is taken. */
  flash: THREE.MeshStandardMaterial | null;
  /** Where the flashlight's beam starts (its +Z is the way it points). */
  beamOrigin: THREE.Object3D | null;
  /** A drink's wisps of steam (refreshmentMeshes.ts). */
  steam: THREE.Sprite[];
}

/** A per-avatar copy of a loaded gadget: its own materials, so fading a
 * disconnected holder or lighting one lens never touches anyone else's. */
export function instantiateHeldItem(source: THREE.Object3D): {
  item: THREE.Object3D;
  parts: HeldItemParts;
} {
  const item = source.clone(true);
  const parts: HeldItemParts = {
    materials: [],
    lens: null,
    flash: null,
    beamOrigin: null,
    steam: [],
  };
  item.traverse((node) => {
    if (node.name === 'Lens') {
      parts.beamOrigin = node;
    }
    if (node instanceof THREE.Sprite) {
      // Each wisp fades on its own.
      node.material = node.material.clone();
      parts.steam.push(node);
      return;
    }
    if (!(node instanceof THREE.Mesh)) {
      return;
    }
    const clone = (material: THREE.Material) => {
      const copy = (material as THREE.MeshStandardMaterial).clone();
      parts.materials.push(copy);
      if (copy.name === 'FlashlightLens') {
        parts.lens = copy;
        copy.emissiveIntensity = 0;
      } else if (copy.name === 'CameraFlash') {
        parts.flash = copy;
        copy.emissiveIntensity = 0;
      }
      return copy;
    };
    node.material = Array.isArray(node.material)
      ? node.material.map(clone)
      : clone(node.material as THREE.Material);
  });
  return { item, parts };
}
