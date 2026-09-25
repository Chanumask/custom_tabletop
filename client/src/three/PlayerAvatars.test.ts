import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Player, PlayerColorId } from '@custom-tabletop/shared';
import { PlayerAvatars } from './PlayerAvatars.js';
import type { CharacterAsset, CharacterSource } from './characters.js';
import { nameTagLabel } from './nameTag.js';
import { speechSeconds, wrapSpeech } from './speechBubble.js';

/** A stand-in character: a body mesh wearing a "Shirt" material, plus the
 * clips PlayerAvatars looks for (empty motion is fine for these tests). */
function fakeCharacters(): CharacterSource & { loads: PlayerColorId[] } {
  const loads: PlayerColorId[] = [];
  const clip = (name: string) =>
    new THREE.AnimationClip(name, 1, [new THREE.NumberKeyframeTrack('.scale[x]', [0, 1], [1, 1])]);
  return {
    loads,
    async load(color: PlayerColorId): Promise<CharacterAsset> {
      loads.push(color);
      const scene = new THREE.Group();
      scene.add(
        new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: 'Shirt' })),
      );
      scene.add(
        new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: 'Skin' })),
      );
      return { scene, animations: ['Idle', 'Walk', 'Run', 'Wave', 'Death'].map(clip) };
    },
  };
}

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    color: 'red',
    character: { id, name: id },
    position: { x: 0, y: 1.7, z: 0 },
    rotationY: 0,
    muted: false,
    seated: false,
    seatIndex: null,
    connected: true,
    ...overrides,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function shirtOf(avatars: PlayerAvatars, id: string): THREE.MeshStandardMaterial {
  let shirt: THREE.MeshStandardMaterial | undefined;
  avatars.objectFor(id)?.traverse((node) => {
    if (node instanceof THREE.Mesh && node.material.name === 'Shirt') shirt = node.material;
  });
  if (!shirt) throw new Error('no shirt');
  return shirt;
}

describe('PlayerAvatars', () => {
  it('gives every other player a character (never the local player) in their color', async () => {
    const characters = fakeCharacters();
    const avatars = new PlayerAvatars(new THREE.Scene(), characters);
    avatars.sync(
      [player('me'), player('a', { color: 'blue' }), player('b', { color: 'green' })],
      'me',
    );
    await flush();

    expect(avatars.stats()).toEqual({ avatars: 2, loaded: 2 });
    expect(characters.loads.sort()).toEqual(['blue', 'green']);
    expect(`#${shirtOf(avatars, 'a').color.getHexString()}`).toBe('#3d7fdb');
    expect(avatars.objectFor('me')).toBeUndefined();
  });

  it('gives each avatar its own materials, so tinting one never affects another', async () => {
    const avatars = new PlayerAvatars(new THREE.Scene(), fakeCharacters());
    avatars.sync([player('a', { color: 'red' }), player('b', { color: 'red' })], 'me');
    await flush();
    expect(shirtOf(avatars, 'a')).not.toBe(shirtOf(avatars, 'b'));
  });

  it('swaps to the new character when a player changes color', async () => {
    const characters = fakeCharacters();
    const avatars = new PlayerAvatars(new THREE.Scene(), characters);
    avatars.sync([player('a', { color: 'red' })], 'me');
    await flush();
    avatars.sync([player('a', { color: 'purple' })], 'me');
    await flush();
    expect(characters.loads).toEqual(['red', 'purple']);
    expect(`#${shirtOf(avatars, 'a').color.getHexString()}`).toBe('#9160d6');
  });

  it('removes the avatar of a player who left', async () => {
    const scene = new THREE.Scene();
    const avatars = new PlayerAvatars(scene, fakeCharacters());
    avatars.sync([player('a'), player('b')], 'me');
    await flush();
    avatars.sync([player('a')], 'me');
    expect(avatars.stats().avatars).toBe(1);
    expect(scene.getObjectByName('avatar-b')).toBeUndefined();
  });

  it('glides toward live position updates instead of teleporting, but snaps a big jump', async () => {
    const avatars = new PlayerAvatars(new THREE.Scene(), fakeCharacters());
    avatars.sync([player('a')], 'me');
    await flush();

    avatars.updateOne('a', { x: 1, y: 1.7, z: 0 }, 0);
    avatars.update(1 / 60);
    const x = avatars.objectFor('a')!.position.x;
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(1);

    avatars.updateOne('a', { x: -4, y: 1.7, z: 3 }, 0);
    avatars.update(1 / 60);
    expect(avatars.objectFor('a')!.position.x).toBeCloseTo(-4);
  });

  it('seats a seated player on a chair, facing the way the chair faces', async () => {
    const seats = [
      { x: 3, z: -1.56, yaw: 0 },
      { x: 0, z: 1.56, yaw: Math.PI },
    ];
    const avatars = new PlayerAvatars(new THREE.Scene(), fakeCharacters(), seats);
    // The chair they chose (seatIndex), not whichever is nearest to them.
    avatars.sync(
      [player('a', { seated: true, seatIndex: 1, position: { x: 2.8, y: 1.7, z: -2 } })],
      'me',
    );
    await flush();
    avatars.update(1 / 60);

    const object = avatars.objectFor('a')!;
    // On the chair (nudged a little toward the table, which this seat faces).
    expect(object.position.x).toBeCloseTo(0);
    expect(object.position.z).toBeGreaterThan(1.4);
    expect(object.position.z).toBeLessThan(1.56);
    expect(object.rotation.y).toBeCloseTo(Math.PI);
  });

  it('turns a reconnecting player into a translucent ghost and back', async () => {
    const avatars = new PlayerAvatars(new THREE.Scene(), fakeCharacters());
    avatars.sync([player('a', { connected: false })], 'me');
    await flush();
    expect(shirtOf(avatars, 'a').opacity).toBeLessThan(1);
    avatars.sync([player('a', { connected: true })], 'me');
    expect(shirtOf(avatars, 'a').opacity).toBe(1);
  });

  it('shows what a player says over their character, then lets it fade away', async () => {
    const avatars = new PlayerAvatars(new THREE.Scene(), fakeCharacters());
    avatars.sync([player('me'), player('bob')], 'me');
    await flush();

    avatars.say('bob', 'The door is trapped!');
    avatars.say('me', 'I never see my own bubble'); // no avatar for yourself
    expect(avatars.isSpeaking('bob')).toBe(true);
    expect(avatars.isSpeaking('me')).toBe(false);

    avatars.update(speechSeconds('The door is trapped!') - 0.1);
    expect(avatars.isSpeaking('bob')).toBe(true);
    avatars.update(0.2);
    expect(avatars.isSpeaking('bob')).toBe(false);
  });

  it('dispose removes the avatar group from the scene', async () => {
    const scene = new THREE.Scene();
    const avatars = new PlayerAvatars(scene, fakeCharacters());
    avatars.sync([player('a')], 'me');
    await flush();
    avatars.dispose();
    expect(scene.getObjectByName('player-avatars')).toBeUndefined();
  });
});

describe('nameTagLabel', () => {
  const base = { name: 'Mia', colorHex: '#d9443b', muted: false, away: false };
  it('shows the name, plus status when relevant', () => {
    expect(nameTagLabel(base)).toBe('Mia');
    expect(nameTagLabel({ ...base, muted: true })).toBe('Mia · muted');
    expect(nameTagLabel({ ...base, away: true, muted: true })).toBe('Mia · reconnecting…');
  });
});

describe('wrapSpeech', () => {
  it('wraps at word boundaries', () => {
    expect(wrapSpeech('the quick brown fox jumps over', 12)).toEqual([
      'the quick',
      'brown fox',
      'jumps over',
    ]);
  });

  it('cuts off with an ellipsis past the last line, and splits very long words', () => {
    expect(wrapSpeech('one two three four five six', 7, 2)).toEqual(['one two', 'three…']);
    expect(wrapSpeech('aaaaaaaaaaaa', 5)).toEqual(['aaaaa', 'aaaaa', 'aa']);
  });
});
