import * as THREE from 'three';
import type { Player } from '@custom-tabletop/shared';

const DIRECTION = new THREE.Vector3();
const FLASHLIGHT_DISTANCE = 5;
export const FLASHLIGHT_INTENSITY = 8;
/** Someone else's beam before their flashlight's model is in their hand,
 * in their avatar's local space (models face +Z): from about chest
 * height, aimed ahead and a little down. */
const OTHER_BEAM_ORIGIN = new THREE.Vector3(0, 1.3, 0);
const OTHER_BEAM_AIM = new THREE.Vector3(0, 0.78, 4);

/** Where someone else's beam can start from. */
export interface BeamSources {
  /** The glass of the flashlight in their hand (its +Z points the way the
   * flashlight does), once it's there. */
  lensOf(playerId: string): THREE.Object3D | undefined;
  avatarOf(playerId: string): THREE.Object3D | undefined;
}

/**
 * Points the room's one flashlight beam (gadgets phase 3) for this frame.
 * The table has one flashlight, so one light serves whoever holds it: from
 * the camera when it's us (we have no avatar of our own), from the lens of
 * the flashlight in their hand otherwise, and dark when it's off or its
 * holder isn't in view. A light per avatar would change the scene's light
 * count on every join, recompiling every material (docs/decisions.md,
 * "Gadgets review").
 */
export function aimFlashlightBeam(
  beam: THREE.SpotLight,
  players: readonly Player[],
  playerId: string,
  camera: THREE.Camera,
  sources: BeamSources,
): void {
  const holder = players.find((player) => player.flashlightOn);
  if (!holder) {
    beam.intensity = 0;
    return;
  }
  if (holder.id === playerId) {
    beam.intensity = FLASHLIGHT_INTENSITY;
    beam.position.copy(camera.position);
    camera.getWorldDirection(DIRECTION);
    beam.target.position.copy(camera.position).addScaledVector(DIRECTION, FLASHLIGHT_DISTANCE);
    return;
  }
  const avatar = sources.avatarOf(holder.id);
  if (!avatar?.visible) {
    beam.intensity = 0;
    return;
  }
  beam.intensity = FLASHLIGHT_INTENSITY;
  const lens = sources.lensOf(holder.id);
  if (lens) {
    lens.updateWorldMatrix(true, false);
    lens.getWorldPosition(beam.position);
    DIRECTION.setFromMatrixColumn(lens.matrixWorld, 2).normalize();
    beam.target.position.copy(beam.position).addScaledVector(DIRECTION, FLASHLIGHT_DISTANCE);
  } else {
    avatar.updateWorldMatrix(true, false);
    avatar.localToWorld(beam.position.copy(OTHER_BEAM_ORIGIN));
    avatar.localToWorld(beam.target.position.copy(OTHER_BEAM_AIM));
  }
}
