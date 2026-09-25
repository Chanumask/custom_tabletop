import * as THREE from 'three';

/**
 * Test-only (not itself a test file): a tiny stand-in for the characters'
 * right arm, named the way GLTFLoader names the real rig's bones
 * ("Wrist.R" -> "WristR"). Each bone points along its own +Y, like the
 * real ones; the arm hangs straight down from the shoulder with the palm
 * facing the body, and the character faces +Z.
 */
export function armSkeleton(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'CharacterArmature';
  const bone = (name: string, parent: THREE.Object3D, y: number) => {
    const node = new THREE.Bone();
    node.name = name;
    node.position.set(0, y, 0);
    parent.add(node);
    return node;
  };
  const shoulder = new THREE.Bone();
  shoulder.name = 'UpperArmR';
  shoulder.position.set(-0.18, 1.4, 0);
  // Hanging: the bone's +Y points down, its -Z (the palm) toward +X.
  shoulder.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(-1, 0, 0),
    ),
  );
  root.add(shoulder);
  const forearm = bone('LowerArmR', shoulder, 0.25);
  const hand = bone('WristR', forearm, 0.22);
  for (const finger of ['Index', 'Middle', 'Ring', 'Pinky']) {
    let parent: THREE.Object3D = hand;
    for (const joint of [1, 2, 3, 4]) {
      parent = bone(`${finger}${joint}R`, parent, joint === 1 ? 0.03 : 0.03);
    }
  }
  let thumb: THREE.Object3D = hand;
  for (const joint of [1, 2, 3]) {
    thumb = bone(`Thumb${joint}R`, thumb, 0.025);
  }
  return root;
}

/** The fist every finger and thumb joint closes to in the fake punching
 * clip: a quarter turn about the bone's own X. */
export const FAKE_FIST = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  -Math.PI / 2,
);

/** A punching clip whose right hand holds `FAKE_FIST` throughout. */
export function punchClip(): THREE.AnimationClip {
  const names = [
    ...['Index', 'Middle', 'Ring', 'Pinky'].flatMap((f) => [1, 2, 3, 4].map((j) => `${f}${j}R`)),
    ...[1, 2, 3].map((j) => `Thumb${j}R`),
  ];
  const values = FAKE_FIST.toArray();
  return new THREE.AnimationClip(
    'Punch_Right',
    1,
    names.map(
      (name) =>
        new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, [0, 1], [...values, ...values]),
    ),
  );
}

/** A gadget like the Blender build's: a mesh with the named materials the
 * avatar code drives, and a "Lens" empty at its front. */
export function fakeGadget(): THREE.Object3D {
  const scene = new THREE.Group();
  const lens = new THREE.MeshStandardMaterial({ name: 'FlashlightLens', emissive: 0xffffff });
  const flash = new THREE.MeshStandardMaterial({ name: 'CameraFlash', emissive: 0xffffff });
  const body = new THREE.MeshStandardMaterial({ name: 'Body' });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.15), [body, lens, flash]);
  scene.add(mesh);
  const tip = new THREE.Object3D();
  tip.name = 'Lens';
  tip.position.set(0, 0, 0.075);
  scene.add(tip);
  return scene;
}
