import * as THREE from 'three';

/** On the wall beside the door, on the handle side — where your hand goes
 * coming in. The south wall's inner face is at z = 4; the plate faces -z. */
export const LIGHT_SWITCH_POSITION = { x: 3.64, y: 1.28, z: 3.992 };
/** Walk up to it (this close, across the floor) and press E. */
export const LIGHT_SWITCH_RANGE = 1.15;
/** Where to stand to reach it — the proximity point, a little into the room. */
export const LIGHT_SWITCH_SPOT = { x: 3.64, z: 3.55 };

/** The lever's tilt: up is on, down is off. */
const LEVER_TILT = 0.45;

/**
 * The room's main light switch (docs/decisions.md, "The cozy room, lived in"): a
 * brass plate with a little ivory lever, on the wall by the door — the
 * reading lamp by the armchair has its own switch now.
 */
export class LightSwitch {
  private readonly group = new THREE.Group();
  private readonly lever: THREE.Mesh;
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];

  constructor(scene: THREE.Scene) {
    this.group.name = 'light-switch';
    const { x, y, z } = LIGHT_SWITCH_POSITION;
    this.group.position.set(x, y, z);

    const brass = this.keepMaterial(
      new THREE.MeshStandardMaterial({ color: 0xb58b4c, metalness: 0.85, roughness: 0.35 }),
    );
    const ivory = this.keepMaterial(
      new THREE.MeshStandardMaterial({ color: 0xefe6d2, roughness: 0.4 }),
    );
    const dark = this.keepMaterial(
      new THREE.MeshStandardMaterial({ color: 0x2a2016, roughness: 0.6 }),
    );

    const plate = new THREE.Mesh(this.keepGeometry(roundedPlate(0.078, 0.122, 0.012)), brass);
    plate.position.z = -0.006;
    this.group.add(plate);
    // The slot the lever sits in, and two screws.
    const slot = new THREE.Mesh(
      this.keepGeometry(new THREE.BoxGeometry(0.014, 0.034, 0.004)),
      dark,
    );
    slot.position.z = -0.013;
    this.group.add(slot);
    for (const dy of [-0.045, 0.045]) {
      const screw = new THREE.Mesh(
        this.keepGeometry(new THREE.CylinderGeometry(0.0045, 0.0045, 0.003, 12)),
        brass,
      );
      screw.rotation.x = Math.PI / 2;
      screw.position.set(0, dy, -0.0135);
      this.group.add(screw);
    }
    // The lever pivots at the slot; tilting its tip toward +y is "on".
    const leverGeometry = this.keepGeometry(new THREE.CapsuleGeometry(0.0045, 0.022, 4, 10));
    leverGeometry.translate(0, 0.013, 0);
    this.lever = new THREE.Mesh(leverGeometry, ivory);
    this.lever.position.z = -0.014;
    this.group.add(this.lever);

    scene.add(this.group);
    this.setOn(true);
  }

  setOn(on: boolean): void {
    // Tip out of the wall (-z), then up or down.
    this.lever.rotation.x = on ? -Math.PI / 2 + LEVER_TILT : -Math.PI / 2 - LEVER_TILT;
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.materials.forEach((material) => material.dispose());
    this.geometries.forEach((geometry) => geometry.dispose());
  }

  private keepMaterial<T extends THREE.Material>(material: T): T {
    this.materials.push(material);
    return material;
  }

  private keepGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }
}

/** A thin plate with softly rounded corners, face toward -z. */
function roundedPlate(width: number, height: number, depth: number): THREE.ExtrudeGeometry {
  const r = 0.01;
  const w = width / 2 - r;
  const h = height / 2 - r;
  const shape = new THREE.Shape();
  shape.moveTo(-w, -h - r);
  shape.lineTo(w, -h - r);
  shape.quadraticCurveTo(w + r, -h - r, w + r, -h);
  shape.lineTo(w + r, h);
  shape.quadraticCurveTo(w + r, h + r, w, h + r);
  shape.lineTo(-w, h + r);
  shape.quadraticCurveTo(-w - r, h + r, -w - r, h);
  shape.lineTo(-w - r, -h);
  shape.quadraticCurveTo(-w - r, -h - r, -w, -h - r);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.002,
    bevelSize: 0.002,
    bevelSegments: 2,
    curveSegments: 6,
  });
  // Extruded along +z; flip so the face looks into the room (-z).
  geometry.translate(0, 0, -depth / 2);
  geometry.rotateY(Math.PI);
  return geometry;
}
