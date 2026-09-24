import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { EmoteId, PlayerColorId } from '@custom-tabletop/shared';

/** What a character model provides: its scene (skinned, with a material
 * named `Shirt`) and its animation clips (`Idle`, `Walk`, `Run`, emotes). */
export interface CharacterAsset {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

/** Loads the character model for a player color — an interface so the
 * avatar code can be tested with synthetic models (no network/WebGL). */
export interface CharacterSource {
  load(color: PlayerColorId): Promise<CharacterAsset>;
}

/** Built by scripts/build-characters.mjs — one distinct character per color. */
export function characterUrl(color: PlayerColorId): string {
  return `/models/characters/${color}.glb`;
}

/** Who each color plays as — shown next to the color picker. */
export const CHARACTER_TITLES: Record<PlayerColorId, string> = {
  red: 'the Regular',
  blue: 'the Local',
  green: 'the Ranger',
  yellow: 'the Explorer',
  purple: 'the Rebel',
  orange: 'the Rocker',
};

/** Emote -> the animation clip that performs it. */
export const EMOTE_CLIPS: Record<EmoteId, string> = {
  wave: 'Wave',
  point: 'Interact',
  punch: 'Punch_Right',
  kick: 'Kick_Left',
  roll: 'Roll',
  faint: 'Death',
};

/** Loads each color's model at most once; every avatar clones from it. */
export class CharacterLibrary implements CharacterSource {
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<PlayerColorId, Promise<CharacterAsset>>();

  load(color: PlayerColorId): Promise<CharacterAsset> {
    let pending = this.cache.get(color);
    if (!pending) {
      pending = this.loader
        .loadAsync(characterUrl(color))
        .then((gltf) => ({ scene: gltf.scene, animations: gltf.animations }));
      pending.catch(() => this.cache.delete(color)); // allow a retry after a failed load
      this.cache.set(color, pending);
    }
    return pending;
  }
}
