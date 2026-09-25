import * as THREE from 'three';
import type { Player } from '@custom-tabletop/shared';

const FLASHLIGHT_DIRECTION = new THREE.Vector3();
const FLASHLIGHT_DISTANCE = 5;
export const FLASHLIGHT_INTENSITY = 8;
/** Someone else's beam, in their avatar's local space (models face +Z):
 * from about chest height, aimed ahead and a little down. */
const OTHER_BEAM_ORIGIN = new THREE.Vector3(0, 1.3, 0);
const OTHER_BEAM_AIM = new THREE.Vector3(0, 0.78, 4);

/**
 * Points the room's one flashlight beam (gadgets phase 3) for this frame.
 * The table has one flashlight, so one light serves whoever holds it: from
 * the camera when it's us (we have no avatar of our own), from their
 * avatar otherwise, and dark when it's off or its holder isn't in view. A
 * light per avatar would change the scene's light count on every join,
 * recompiling every material (docs/decisions.md, "Gadgets review").
 */
export function aimFlashlightBeam(
  beam: THREE.SpotLight,
  players: readonly Player[],
  playerId: string,
  camera: THREE.Camera,
  avatarFor: (playerId: string) => THREE.Object3D | undefined,
): void {
  const holder = players.find((player) => player.flashlightOn);
  const holderAvatar = holder && holder.id !== playerId ? avatarFor(holder.id) : undefined;
  if (holder?.id === playerId) {
    beam.intensity = FLASHLIGHT_INTENSITY;
    beam.position.copy(camera.position);
    camera.getWorldDirection(FLASHLIGHT_DIRECTION);
    beam.target.position
      .copy(camera.position)
      .addScaledVector(FLASHLIGHT_DIRECTION, FLASHLIGHT_DISTANCE);
  } else if (holderAvatar?.visible) {
    beam.intensity = FLASHLIGHT_INTENSITY;
    holderAvatar.updateWorldMatrix(true, false);
    holderAvatar.localToWorld(beam.position.copy(OTHER_BEAM_ORIGIN));
    holderAvatar.localToWorld(beam.target.position.copy(OTHER_BEAM_AIM));
  } else {
    beam.intensity = 0;
  }
}
