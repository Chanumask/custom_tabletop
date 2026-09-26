import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { InventoryItem, ItemKind, Player, PlayerColorId } from '@custom-tabletop/shared';
import { PlayerAvatars } from './PlayerAvatars.js';
import { LOUNGE_SPOTS } from './loungeSeats.js';
import { buildMug } from './refreshmentMeshes.js';
import type { CharacterAsset, CharacterSource } from './characters.js';
import type { GadgetSource } from './gadgetMeshes.js';
import { armSkeleton, fakeGadget, punchClip } from './testRig.js';
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
    lounge: null,
    carrying: null,
    connected: true,
    flashlightOn: false,
    profileImage: null,
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

  it("adds no lights: a player joining never changes the scene's light count", async () => {
    const scene = new THREE.Scene();
    const avatars = new PlayerAvatars(scene, fakeCharacters());
    avatars.sync([player('a', { flashlightOn: true }), player('b'), player('c')], 'me');
    await flush();
    const lights: THREE.Light[] = [];
    scene.traverse((object) => {
      if (object instanceof THREE.Light) lights.push(object);
    });
    expect(lights).toEqual([]);
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

  it('sits someone on the sofa or in the rocking chair, rocking with it', async () => {
    const avatars = new PlayerAvatars(new THREE.Scene(), fakeCharacters());
    avatars.sync(
      [
        player('a', { lounge: 'sofa-middle', position: { x: 0, y: 1.7, z: 0 } }),
        player('b', { lounge: 'rocking-chair' }),
      ],
      'me',
    );
    await flush();
    avatars.rockingChairAngle = 0.05;
    avatars.update(1 / 60);

    const sofa = avatars.objectFor('a')!;
    expect(sofa.position.x).toBeCloseTo(LOUNGE_SPOTS['sofa-middle'].x);
    expect(sofa.position.z).toBeCloseTo(LOUNGE_SPOTS['sofa-middle'].z);
    expect(sofa.rotation.x).toBe(0);
    const rocking = avatars.objectFor('b')!;
    expect(rocking.rotation.y).toBeCloseTo(LOUNGE_SPOTS['rocking-chair'].yaw);
    expect(rocking.rotation.x).toBeCloseTo(0.05);
    // Sitting down: no footsteps for them.
    expect(avatars.walkers().every((walker) => walker.seated)).toBe(true);

    avatars.sync([player('a'), player('b')], 'me');
    avatars.update(1 / 60);
    expect(rocking.rotation.x).toBe(0);
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

/** A character with a right arm to hold things in (testRig.ts), whose
 * clips hold every bone at rest — like the real clips, they set the whole
 * arm every frame. */
function riggedCharacters(): CharacterSource {
  return {
    async load(): Promise<CharacterAsset> {
      const scene = armSkeleton();
      const tracks: THREE.KeyframeTrack[] = [];
      scene.traverse((bone) => {
        if (bone instanceof THREE.Bone) {
          const rest = bone.quaternion.toArray();
          tracks.push(
            new THREE.QuaternionKeyframeTrack(
              `${bone.name}.quaternion`,
              [0, 1],
              [...rest, ...rest],
            ),
          );
        }
      });
      const clip = (name: string) => new THREE.AnimationClip(name, 1, tracks);
      return { scene, animations: [...['Idle', 'Walk', 'Run', 'Wave'].map(clip), punchClip()] };
    },
  };
}

const gadgets: GadgetSource = { load: async () => fakeGadget() };

const holding = (kind: ItemKind, heldBy: string | null = 'a'): InventoryItem[] => [
  { id: `${kind}-1`, kind, heldBy },
];

/** Where the right hand is, in the character's own space. */
function handOf(avatars: PlayerAvatars, id: string): THREE.Vector3 {
  const group = avatars.objectFor(id)!;
  group.updateWorldMatrix(true, true);
  const hand = group.getObjectByName('WristR')!;
  return group.worldToLocal(hand.getWorldPosition(new THREE.Vector3()));
}

function gadgetIn(avatars: PlayerAvatars, id: string): THREE.Object3D | undefined {
  return avatars
    .objectFor(id)!
    .getObjectByName('WristR')!
    .children.find((child) => child.getObjectByName('Lens'));
}

describe('PlayerAvatars holding a gadget', () => {
  it('puts it in the right hand and brings the arm up; putting it back lowers it', async () => {
    const avatars = new PlayerAvatars(new THREE.Scene(), riggedCharacters(), [], gadgets);
    avatars.sync([player('a')], 'me', holding('camera'));
    await flush();
    await flush();
    expect(gadgetIn(avatars, 'a')).toBeDefined();
    const hanging = handOf(avatars, 'a');

    for (let i = 0; i < 30; i += 1) avatars.update(1 / 30);
    const held = handOf(avatars, 'a');
    // The camera is held up in front, not hanging at the side.
    expect(held.y - hanging.y).toBeGreaterThan(0.2);
    expect(held.z - hanging.z).toBeGreaterThan(0.2);

    avatars.sync([player('a')], 'me', holding('camera', null));
    expect(gadgetIn(avatars, 'a')).toBeUndefined();
    for (let i = 0; i < 60; i += 1) avatars.update(1 / 30);
    expect(handOf(avatars, 'a').distanceTo(hanging)).toBeLessThan(0.01);
  });

  it("lights the flashlight's glass while it's on, and starts the beam there", async () => {
    const avatars = new PlayerAvatars(new THREE.Scene(), riggedCharacters(), [], gadgets);
    avatars.sync([player('a', { flashlightOn: true })], 'me', holding('flashlight'));
    await flush();
    await flush();
    const lens = avatars.flashlightLensOf('a');
    expect(lens?.name).toBe('Lens');
    const glass = () => {
      let found: THREE.MeshStandardMaterial | undefined;
      gadgetIn(avatars, 'a')!.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          found = (node.material as THREE.MeshStandardMaterial[]).find(
            (material) => material.name === 'FlashlightLens',
          );
        }
      });
      return found!;
    };
    expect(glass().emissiveIntensity).toBeGreaterThan(0);
    avatars.sync([player('a', { flashlightOn: false })], 'me', holding('flashlight'));
    expect(glass().emissiveIntensity).toBe(0);
    expect(avatars.flashlightLensOf('b')).toBeUndefined();
  });

  it('pops the camera flash when they take a photo, then lets it fade', async () => {
    const avatars = new PlayerAvatars(new THREE.Scene(), riggedCharacters(), [], gadgets);
    avatars.sync([player('a')], 'me', holding('camera'));
    await flush();
    await flush();
    let flash: THREE.MeshStandardMaterial | undefined;
    gadgetIn(avatars, 'a')!.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        flash = (node.material as THREE.MeshStandardMaterial[]).find(
          (m) => m.name === 'CameraFlash',
        );
      }
    });
    avatars.flashCamera('a');
    avatars.update(0.02);
    expect(flash!.emissiveIntensity).toBeGreaterThan(1);
    avatars.update(1);
    expect(flash!.emissiveIntensity).toBe(0);
  });

  it("fades a disconnected holder's gadget along with them", async () => {
    const avatars = new PlayerAvatars(new THREE.Scene(), riggedCharacters(), [], gadgets);
    avatars.sync([player('a')], 'me', holding('walkie'));
    await flush();
    await flush();
    avatars.sync([player('a', { connected: false })], 'me', holding('walkie'));
    gadgetIn(avatars, 'a')!.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        for (const material of node.material as THREE.Material[]) {
          expect(material.transparent).toBe(true);
          expect(material.opacity).toBeLessThan(1);
        }
      }
    });
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

describe('PlayerAvatars with a drink', () => {
  const mugs: GadgetSource = {
    load: async (kind) => (kind === 'tea' || kind === 'cocoa' ? buildMug(kind) : fakeGadget()),
  };
  const mugIn = (avatars: PlayerAvatars, id: string) =>
    avatars
      .objectFor(id)!
      .getObjectByName('WristR')!
      .children.find((child) => child.name.startsWith('Mug-'));

  it('holds the drink in the hand — the one thing in it, over any gadget', async () => {
    const avatars = new PlayerAvatars(new THREE.Scene(), riggedCharacters(), [], mugs);
    avatars.sync([player('a', { carrying: 'cocoa' })], 'me', holding('camera'));
    await flush();
    await flush();
    expect(mugIn(avatars, 'a')?.name).toBe('Mug-cocoa');
    expect(gadgetIn(avatars, 'a')).toBeUndefined();
  });

  it('lifts it to the lips for a sip, and back down', async () => {
    const avatars = new PlayerAvatars(new THREE.Scene(), riggedCharacters(), [], mugs);
    avatars.sync([player('a', { carrying: 'tea' })], 'me');
    await flush();
    await flush();
    for (let i = 0; i < 30; i += 1) avatars.update(1 / 30);
    const holdingIt = handOf(avatars, 'a');
    avatars.gesture('a', 'sip');
    for (let i = 0; i < 18; i += 1) avatars.update(1 / 30);
    const sipping = handOf(avatars, 'a');
    expect(sipping.y - holdingIt.y).toBeGreaterThan(0.1);
    for (let i = 0; i < 60; i += 1) avatars.update(1 / 30);
    expect(handOf(avatars, 'a').distanceTo(holdingIt)).toBeLessThan(0.02);
  });

  it('dips into the popcorn with an empty hand', async () => {
    const avatars = new PlayerAvatars(new THREE.Scene(), riggedCharacters(), [], mugs);
    avatars.sync([player('a')], 'me');
    await flush();
    await flush();
    avatars.update(1 / 30);
    const hanging = handOf(avatars, 'a');
    avatars.gesture('a', 'snack');
    for (let i = 0; i < 12; i += 1) avatars.update(1 / 30);
    expect(handOf(avatars, 'a').y - hanging.y).toBeGreaterThan(0.2);
    for (let i = 0; i < 60; i += 1) avatars.update(1 / 30);
    expect(handOf(avatars, 'a').distanceTo(hanging)).toBeLessThan(0.01);
  });
});
