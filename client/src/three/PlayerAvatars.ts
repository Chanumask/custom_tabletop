import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import {
  playerColorHex,
  type EmoteId,
  type Gesture,
  type InventoryItem,
  type LoungeSeat,
  type Player,
  type PlayerColorId,
  type Vector3,
} from '@custom-tabletop/shared';
import {
  lerpAngle,
  locomotionFor,
  playbackRate,
  smoothingFactor,
  type Locomotion,
  type Seat,
} from './avatarMotion.js';
import { EMOTE_CLIPS, type CharacterSource } from './characters.js';
import { GadgetLibrary, type GadgetSource } from './gadgetMeshes.js';
import {
  blendPose,
  emptyHandPose,
  findArmRig,
  GESTURE_POSES,
  gestureWeight,
  HOLDS,
  instantiateHeldItem,
  placeInHand,
  poseHold,
  releaseHold,
  type ArmRig,
  type HeldItemParts,
  type HeldKind,
} from './heldItems.js';
import { LOUNGE_SPOTS, type LoungeSpot } from './loungeSeats.js';
import { steamWisp } from './refreshmentMeshes.js';
import { NameTag } from './nameTag.js';
import { flashingAllowed } from '../audioMix.js';
import { SpeechBubble, speechSeconds } from './speechBubble.js';

// Smoothing between the ~10 Hz player:move updates (see avatarMotion.ts).
const POSITION_HALF_LIFE = 0.06;
const YAW_HALF_LIFE = 0.05;
const SPEED_HALF_LIFE = 0.12;
/** A jump bigger than this (a reconnect, a sit/stand) snaps instead of
 * sliding across the room. */
const TELEPORT_DISTANCE = 3;
const CROSSFADE_SECONDS = 0.22;
/** How long "faint" stays down before getting back up. */
const FAINT_HOLD_SECONDS = 1.4;
const NAME_TAG_HEIGHT = 2.18;
const SEATED_NAME_TAG_HEIGHT = 1.7;
/** A speech bubble's tail sits just above the name tag. */
const SPEECH_ABOVE_TAG = 0.1;
const SPEECH_FADE_SECONDS = 0.4;
/** A player inside the server's reconnect grace period is a translucent
 * "ghost" rather than a fully-present figure nobody's actually behind. */
const AWAY_OPACITY = 0.3;

/** Sitting on a chair: the whole figure drops so the hips rest on the seat,
 * and the leg bones fold (thighs forward, shins down). The characters have
 * no sitting animation, so this is posed on top of the idle clip. */
const SIT_DROP = 0.44;
/** Sits a little forward of the chair's center, so the back (and any
 * backpack) clears the chair's backrest. */
const SIT_FORWARD = 0.08;
const SIT_THIGH = -Math.PI / 2;
const SIT_KNEE = Math.PI / 2;
const X_AXIS = new THREE.Vector3(1, 0, 0);

/** Walking pace coming in through the door (m/s). */
const ENTRANCE_SPEED = 1.3;
/** How quickly the arm comes up to hold a gadget (and drops again). */
const HOLD_HALF_LIFE = 0.08;
/** The flashlight's glass while it's on, and the camera flash's pop. */
const LENS_GLOW = 3;
const FLASH_GLOW = 9;
const FLASH_SECONDS = 0.35;

interface LegBones {
  upperL: THREE.Object3D | null;
  upperR: THREE.Object3D | null;
  lowerL: THREE.Object3D | null;
  lowerR: THREE.Object3D | null;
  /** Leaning back into a sofa: the lower back, and the neck to keep the
   * head up. */
  abdomen: THREE.Object3D | null;
  neck: THREE.Object3D | null;
}

/**
 * Bends bones on top of the clip, and puts the clip's own values back
 * before the next mixer update: the mixer only writes a value when it
 * changes, so a bend left in place would pile up, frame on frame, whenever
 * the clip holds still.
 */
class BonePoser {
  private readonly saved: { bone: THREE.Object3D; value: THREE.Quaternion }[] = [];
  private count = 0;

  bend(model: THREE.Object3D, bone: THREE.Object3D | null, angle: number): void {
    if (!bone || angle === 0) return;
    let slot = this.saved[this.count];
    if (!slot) {
      slot = { bone, value: new THREE.Quaternion() };
      this.saved.push(slot);
    }
    slot.bone = bone;
    slot.value.copy(bone.quaternion);
    this.count += 1;
    bendAboutModelAxis(model, bone, angle);
  }

  /** Undoes every bend, newest first. */
  restore(): void {
    for (let i = this.count - 1; i >= 0; i--) {
      const slot = this.saved[i]!;
      slot.bone.quaternion.copy(slot.value);
    }
    this.count = 0;
  }

  forget(): void {
    this.count = 0;
  }
}

interface Avatar {
  id: string;
  color: PlayerColorId;
  /** World placement: feet on the floor, facing `current.yaw`. */
  group: THREE.Group;
  model: THREE.Object3D | null;
  mixer: THREE.AnimationMixer | null;
  actions: Map<string, THREE.AnimationAction>;
  materials: THREE.Material[];
  legs: LegBones | null;
  locomotion: Locomotion | null;
  /** Whether a clip has played yet (the first one snaps in, the rest fade). */
  animating: boolean;
  emote: { action: THREE.AnimationAction; holdUntil: number | null } | null;
  target: { x: number; z: number; yaw: number };
  current: { x: number; z: number; yaw: number };
  speed: number;
  seated: boolean;
  seat: Seat | null;
  /** Sitting on the sofa, the armchair or the rocking chair instead of at
   * the table (`seated` is true then too, and `seat` is this spot). */
  lounge: LoungeSeat | null;
  loungeSpot: LoungeSpot | null;
  /** The sitting pose's bends, undone before each mixer update. */
  poser: BonePoser;
  connected: boolean;
  nameTag: NameTag;
  /** What they just said in chat, until `until` (on the avatars' clock). */
  speech: { bubble: SpeechBubble; until: number } | null;
  loadToken: number;
  /** The right arm (single held item, one gadget at a time): the gadget
   * sits in its hand bone, and the arm is posed to hold it (heldItems.ts).
   * Found once the model loads; null until then, or if the rig lacks it. */
  arm: ArmRig | null;
  /** How far the arm is into the holding pose (0 down, 1 holding), and
   * how closed the hand is around the gadget — eased so taking or putting
   * back a gadget doesn't snap. An emote has the arm, never the grip. */
  holdWeight: number;
  gripWeight: number;
  /** The gadget the arm is posed for — still set while it eases back down
   * after the gadget went back in the chest. */
  holdKind: HeldKind | null;
  /** A sip, a toast or a snack in progress (on the avatars' clock). */
  gesture: { kind: Gesture; at: number } | null;
  flashlightOn: boolean;
  /** When the camera flash last popped (on the avatars' clock). */
  flashAt: number;
  /** Coming in through the door (a new arrival): hidden until `startAt`
   * (on the avatars' clock), then walking from `from` to `to`. */
  entrance: {
    from: { x: number; z: number };
    to: { x: number; z: number };
    startAt: number;
    duration: number;
  } | null;
  /** Which gadget this player currently holds (from `GameState.inventory`,
   * `sync`'s third argument), and the loaded mesh for it, once it resolves. */
  heldItemKind: HeldKind | null;
  heldItemMesh: THREE.Object3D | null;
  heldItemParts: HeldItemParts | null;
  /** Cancels a stale gadget-mesh load if the held kind changes again (or
   * the avatar is removed) before the previous one resolves. */
  heldItemLoadToken: number;
}

/** GLTFLoader strips "." from node names ("UpperLeg.L" -> "UpperLegL"). */
function bone(model: THREE.Object3D, name: string): THREE.Object3D | null {
  return model.getObjectByName(name.replace('.', '')) ?? model.getObjectByName(name) ?? null;
}

/**
 * Character avatars for every *other* player (the local player sees through
 * their own camera instead) — one of eight distinct character models, picked
 * by the player's color, with the shirt tinted to it.
 *
 * Membership, color, presence, name and seating come from `sync` (driven by
 * GameState); live position comes from `updateOne` (driven by the frequent
 * player:move deltas) and is *interpolated* in `update`, so movement looks
 * smooth despite arriving ~10 times a second, and the idle/walk/run clip
 * follows the actual ground speed. A seated player is placed on a chair
 * (its `seatIndex` — chosen once when they sit, the same for everyone)
 * in a sitting pose; emotes play once and blend back.
 */
export class PlayerAvatars {
  private readonly group = new THREE.Group();
  private readonly avatars = new Map<string, Avatar>();
  private clock = 0;
  /** The rocking chair's tilt now (RockingChair) — whoever sits in it rocks
   * with it. */
  rockingChairAngle = 0;

  constructor(
    scene: THREE.Scene,
    private readonly characters: CharacterSource,
    private readonly seats: Seat[] = [],
    private readonly gadgets: GadgetSource = new GadgetLibrary(),
  ) {
    this.group.name = 'player-avatars';
    scene.add(this.group);
  }

  /** `inventory` (gadgets, single item slot) is optional so callers with
   * nothing to show yet — or tests uninterested in held items — can omit
   * it; a player with no entry there just shows empty-handed. */
  sync(players: Player[], selfId: string, inventory: InventoryItem[] = []): void {
    const others = players.filter((player) => player.id !== selfId);
    // A drink or a gadget: one hand, one thing.
    const heldKindOf = (player: Player): HeldKind | null =>
      player.carrying ?? inventory.find((item) => item.heldBy === player.id)?.kind ?? null;

    for (const player of others) {
      let avatar = this.avatars.get(player.id);
      if (!avatar) {
        avatar = this.createAvatar(player);
      } else if (avatar.color !== player.color) {
        avatar.color = player.color;
        this.loadModel(avatar);
      }

      avatar.target = { x: player.position.x, z: player.position.z, yaw: player.rotationY };
      this.setHeldItem(avatar, heldKindOf(player));
      avatar.flashlightOn = player.flashlightOn;
      lightLens(avatar);
      avatar.lounge = player.lounge ?? null;
      avatar.loungeSpot = avatar.lounge ? LOUNGE_SPOTS[avatar.lounge] : null;
      avatar.seated = player.seated || avatar.loungeSpot !== null;
      avatar.seat =
        avatar.loungeSpot ??
        (player.seated && player.seatIndex !== null
          ? (this.seats[player.seatIndex] ?? null)
          : null);
      if (avatar.connected !== player.connected) {
        avatar.connected = player.connected;
        applyPresence(avatar);
      }
      avatar.nameTag.update({
        name: player.name,
        colorHex: playerColorHex(player.color),
        muted: player.muted,
        away: !player.connected,
      });
    }

    const present = new Set(others.map((player) => player.id));
    for (const [id, avatar] of this.avatars) {
      if (!present.has(id)) {
        this.removeAvatar(avatar);
      }
    }
  }

  /** A live `player:move` for someone — becomes the interpolation target
   * (and ends a walk in through the door: they're moving themselves now). */
  updateOne(playerId: string, position: Vector3, rotationY: number): void {
    const avatar = this.avatars.get(playerId);
    if (avatar) {
      if (avatar.entrance) {
        avatar.entrance = null;
        avatar.group.visible = true;
      }
      avatar.target = { x: position.x, z: position.z, yaw: rotationY };
    }
  }

  /** Someone just arrived: after `delay` seconds (the knock, the door
   * opening) they appear in the doorway at `from` and walk to where they
   * stand. */
  enter(playerId: string, from: { x: number; z: number }, delay: number): void {
    const avatar = this.avatars.get(playerId);
    if (!avatar || avatar.seated) return;
    const to = { x: avatar.target.x, z: avatar.target.z };
    avatar.entrance = {
      from,
      to,
      startAt: this.clock + delay,
      duration: Math.max(0.8, Math.hypot(to.x - from.x, to.z - from.z) / ENTRANCE_SPEED),
    };
    avatar.group.visible = false;
  }

  /** Where everyone is right now (interpolated) — for their footsteps. */
  walkers(): { id: string; x: number; z: number; seated: boolean; visible: boolean }[] {
    return [...this.avatars.values()].map((avatar) => ({
      id: avatar.id,
      x: avatar.current.x,
      z: avatar.current.z,
      seated: avatar.seated,
      visible: avatar.group.visible && avatar.connected,
    }));
  }

  playEmote(playerId: string, emote: EmoteId): void {
    const avatar = this.avatars.get(playerId);
    const action = avatar?.actions.get(EMOTE_CLIPS[emote]);
    if (!avatar || !action || avatar.seated) {
      return;
    }
    avatar.emote?.action.fadeOut(CROSSFADE_SECONDS);
    // The emote takes over the whole body: the idle/walk clip fades out and
    // comes back (crossfaded) once the emote is done.
    if (avatar.locomotion) {
      avatar.actions.get(avatar.locomotion)?.fadeOut(CROSSFADE_SECONDS);
      avatar.locomotion = null;
    }
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.fadeIn(CROSSFADE_SECONDS).play();
    avatar.emote = { action, holdUntil: null };
  }

  /** A sip of their drink, a toast, a handful of popcorn: the arm does it
   * over whatever else it's doing (not in the middle of an emote). */
  gesture(playerId: string, gesture: Gesture): void {
    const avatar = this.avatars.get(playerId);
    if (avatar) avatar.gesture = { kind: gesture, at: this.clock };
  }

  /** Shows a chat line in a bubble over a player's character for a few
   * seconds (replacing anything they said just before). */
  say(playerId: string, text: string): void {
    const avatar = this.avatars.get(playerId);
    if (!avatar) {
      return;
    }
    this.clearSpeech(avatar);
    const bubble = new SpeechBubble(text, playerColorHex(avatar.color));
    avatar.group.add(bubble.sprite);
    avatar.speech = { bubble, until: this.clock + speechSeconds(text) };
    this.updateSpeech(avatar);
  }

  /** Whether a player has a speech bubble up right now — for tests. */
  isSpeaking(playerId: string): boolean {
    return !!this.avatars.get(playerId)?.speech;
  }

  update(deltaSeconds: number): void {
    this.clock += deltaSeconds;
    for (const avatar of this.avatars.values()) {
      this.updateAvatar(avatar, deltaSeconds);
    }
  }

  /** How many avatars exist, and how many have their model loaded. */
  stats(): { avatars: number; loaded: number } {
    let loaded = 0;
    for (const avatar of this.avatars.values()) {
      if (avatar.model) loaded += 1;
    }
    return { avatars: this.avatars.size, loaded };
  }

  /** The world object for a player's avatar (tests/debugging, and the
   * flashlight beam until the flashlight's model is in their hand). */
  objectFor(playerId: string): THREE.Group | undefined {
    return this.avatars.get(playerId)?.group;
  }

  /** The glass of the flashlight in a player's hand (its +Z is the way it
   * points), once it's there — where their beam starts. */
  flashlightLensOf(playerId: string): THREE.Object3D | undefined {
    const avatar = this.avatars.get(playerId);
    if (!avatar?.arm || avatar.heldItemKind !== 'flashlight') {
      return undefined;
    }
    return avatar.heldItemParts?.beamOrigin ?? undefined;
  }

  /** The camera in a player's hand flashes (they just took a photo) —
   * unless this player turned flashing effects off (audioMix.ts). */
  flashCamera(playerId: string): void {
    const avatar = this.avatars.get(playerId);
    if (avatar && flashingAllowed()) {
      avatar.flashAt = this.clock;
    }
  }

  dispose(): void {
    for (const avatar of [...this.avatars.values()]) {
      this.removeAvatar(avatar);
    }
    this.group.parent?.remove(this.group);
  }

  private createAvatar(player: Player): Avatar {
    const group = new THREE.Group();
    group.name = `avatar-${player.id}`;
    // Turned to face its way first, then tipped (the rocking chair) about
    // its own left-right axis.
    group.rotation.order = 'YXZ';
    const nameTag = new NameTag();
    group.add(nameTag.sprite);

    this.group.add(group);

    const start = { x: player.position.x, z: player.position.z, yaw: player.rotationY };
    const avatar: Avatar = {
      id: player.id,
      color: player.color,
      group,
      model: null,
      mixer: null,
      actions: new Map(),
      materials: [],
      legs: null,
      locomotion: null,
      animating: false,
      emote: null,
      target: { ...start },
      current: { ...start },
      speed: 0,
      seated: player.seated,
      seat: null,
      lounge: null,
      loungeSpot: null,
      poser: new BonePoser(),
      connected: player.connected,
      nameTag,
      speech: null,
      loadToken: 0,
      arm: null,
      holdWeight: 0,
      gripWeight: 0,
      holdKind: null,
      gesture: null,
      flashlightOn: player.flashlightOn,
      flashAt: -Infinity,
      entrance: null,
      heldItemKind: null,
      heldItemMesh: null,
      heldItemParts: null,
      heldItemLoadToken: 0,
    };
    this.avatars.set(player.id, avatar);
    this.loadModel(avatar);
    return avatar;
  }

  private loadModel(avatar: Avatar): void {
    const token = ++avatar.loadToken;
    const color = avatar.color;
    this.characters.load(color).then(
      (asset) => {
        if (token !== avatar.loadToken || !this.avatars.has(avatar.id)) {
          return; // superseded (color changed again) or removed meanwhile
        }
        this.detachModel(avatar);

        const model = cloneSkinned(asset.scene);
        const materials: THREE.Material[] = [];
        model.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            // Per-avatar materials: tinting and ghosting one player must
            // never leak onto another sharing the same model.
            const material = (node.material as THREE.MeshStandardMaterial).clone();
            if (material.name === 'Shirt') {
              material.color.set(playerColorHex(color));
            }
            node.material = material;
            node.frustumCulled = false; // skinned bounds don't follow animation
            materials.push(material);
          }
        });

        const mixer = new THREE.AnimationMixer(model);
        const actions = new Map<string, THREE.AnimationAction>();
        for (const clip of asset.animations) {
          actions.set(clip.name, mixer.clipAction(clip));
        }
        mixer.addEventListener('finished', (event) => {
          const emote = avatar.emote;
          if (!emote || event.action !== emote.action) {
            return;
          }
          if (event.action.getClip().name === EMOTE_CLIPS.faint && emote.holdUntil === null) {
            emote.holdUntil = this.clock + FAINT_HOLD_SECONDS;
          } else {
            emote.action.fadeOut(CROSSFADE_SECONDS);
            avatar.emote = null;
          }
        });

        avatar.model = model;
        avatar.mixer = mixer;
        avatar.actions = actions;
        avatar.materials = materials;
        avatar.legs = {
          upperL: bone(model, 'UpperLeg.L'),
          upperR: bone(model, 'UpperLeg.R'),
          lowerL: bone(model, 'LowerLeg.L'),
          lowerR: bone(model, 'LowerLeg.R'),
          abdomen: bone(model, 'Abdomen'),
          neck: bone(model, 'Neck'),
        };
        avatar.poser.forget();
        avatar.arm = findArmRig((name) => bone(model, name), asset.animations);
        avatar.holdWeight = 0;
        avatar.gripWeight = 0;
        avatar.locomotion = null;
        avatar.animating = false;
        avatar.group.add(model);
        applyPresence(avatar);
        // A color change reloads the model (a fresh hand bone) — any
        // gadget already held needs re-parenting onto it.
        this.attachHeldItem(avatar);
      },
      (error: unknown) => {
        console.error(`Failed to load the ${color} character model:`, error);
      },
    );
  }

  /** Swaps the gadget this avatar is shown holding (single item slot,
   * gadgets phase 6) — `null` empties the hand. A stale load (the kind
   * changed again, or the avatar was removed, before the previous one
   * resolved) is dropped via `heldItemLoadToken`. */
  private setHeldItem(avatar: Avatar, kind: HeldKind | null): void {
    if (avatar.heldItemKind === kind) {
      return;
    }
    avatar.heldItemKind = kind;
    const token = ++avatar.heldItemLoadToken;
    if (avatar.heldItemMesh) {
      avatar.heldItemMesh.parent?.remove(avatar.heldItemMesh);
      avatar.heldItemParts?.materials.forEach((material) => material.dispose());
      avatar.heldItemMesh = null;
      avatar.heldItemParts = null;
    }
    if (!kind) {
      return;
    }
    this.gadgets.load(kind).then(
      (source) => {
        if (token !== avatar.heldItemLoadToken || !this.avatars.has(avatar.id)) {
          return; // superseded (kind changed again) or removed meanwhile
        }
        const { item, parts } = instantiateHeldItem(source);
        avatar.heldItemMesh = item;
        avatar.heldItemParts = parts;
        avatar.holdKind = kind;
        this.attachHeldItem(avatar);
        applyPresence(avatar);
        lightLens(avatar);
      },
      (error: unknown) => {
        console.error(`Failed to load the ${kind} gadget model:`, error);
      },
    );
  }

  /** Puts the loaded gadget in the right hand — once it finishes loading,
   * and again whenever the model itself reloads (a color change gets a
   * fresh hand bone). Until the model is in, there's no hand to hold it. */
  private attachHeldItem(avatar: Avatar): void {
    const item = avatar.heldItemMesh;
    if (!item || !avatar.heldItemKind) {
      return;
    }
    if (!avatar.arm) {
      item.parent?.remove(item);
      return;
    }
    avatar.arm.hand.add(item);
    const hold = HOLDS[avatar.heldItemKind];
    placeInHand(item, hold, avatar.seated ? hold.seated : hold.standing);
  }

  private updateAvatar(avatar: Avatar, dt: number): void {
    const entrance = avatar.entrance;
    if (entrance && this.clock >= entrance.startAt) {
      const t = Math.min(1, (this.clock - entrance.startAt) / entrance.duration);
      if (!avatar.group.visible) {
        // Stepping through the doorway, facing into the room.
        avatar.group.visible = true;
        const yaw = Math.atan2(entrance.to.x - entrance.from.x, entrance.to.z - entrance.from.z);
        avatar.current = { ...entrance.from, yaw };
      }
      const yaw = Math.atan2(entrance.to.x - entrance.from.x, entrance.to.z - entrance.from.z);
      avatar.target = {
        x: entrance.from.x + (entrance.to.x - entrance.from.x) * t,
        z: entrance.from.z + (entrance.to.z - entrance.from.z) * t,
        yaw: t < 1 ? yaw : avatar.target.yaw,
      };
      if (t >= 1) avatar.entrance = null;
    }
    const previous = { x: avatar.current.x, z: avatar.current.z };
    if (avatar.seated && avatar.seat) {
      const { x, z, yaw } = avatar.seat;
      // A lounge spot is where the hips go already; a chair is its middle.
      const forward = avatar.loungeSpot ? 0 : SIT_FORWARD;
      avatar.current = {
        x: x + Math.sin(yaw) * forward,
        z: z + Math.cos(yaw) * forward,
        yaw,
      };
    } else {
      const gap = Math.hypot(
        avatar.target.x - avatar.current.x,
        avatar.target.z - avatar.current.z,
      );
      if (gap > TELEPORT_DISTANCE) {
        avatar.current = { ...avatar.target };
      } else {
        const k = smoothingFactor(dt, POSITION_HALF_LIFE);
        avatar.current.x += (avatar.target.x - avatar.current.x) * k;
        avatar.current.z += (avatar.target.z - avatar.current.z) * k;
        avatar.current.yaw = lerpAngle(
          avatar.current.yaw,
          avatar.target.yaw,
          smoothingFactor(dt, YAW_HALF_LIFE),
        );
      }
    }

    const moved = Math.hypot(avatar.current.x - previous.x, avatar.current.z - previous.z);
    const instantSpeed = dt > 0 && moved < TELEPORT_DISTANCE && !avatar.seated ? moved / dt : 0;
    avatar.speed += (instantSpeed - avatar.speed) * smoothingFactor(dt, SPEED_HALF_LIFE);

    avatar.group.position.set(avatar.current.x, 0, avatar.current.z);
    avatar.group.rotation.y = avatar.current.yaw;
    avatar.group.rotation.x = avatar.lounge === 'rocking-chair' ? this.rockingChairAngle : 0;
    avatar.nameTag.sprite.position.y = avatar.seated ? SEATED_NAME_TAG_HEIGHT : NAME_TAG_HEIGHT;
    this.updateSpeech(avatar);

    if (!avatar.mixer || !avatar.model) {
      return;
    }

    if (!avatar.emote) {
      const locomotion = avatar.seated ? 'Idle' : locomotionFor(avatar.speed);
      if (locomotion !== avatar.locomotion) {
        const next = avatar.actions.get(locomotion);
        const previousAction = avatar.locomotion
          ? avatar.actions.get(avatar.locomotion)
          : undefined;
        if (next) {
          // The very first clip snaps in; every later change crossfades.
          next
            .reset()
            .fadeIn(avatar.animating ? CROSSFADE_SECONDS : 0)
            .play();
          previousAction?.fadeOut(CROSSFADE_SECONDS);
          avatar.animating = true;
        }
        avatar.locomotion = locomotion;
      }
      const current = avatar.actions.get(locomotion);
      if (current) {
        current.timeScale = playbackRate(locomotion, avatar.speed);
      }
    }

    const emote = avatar.emote;
    if (emote && emote.holdUntil !== null && this.clock >= emote.holdUntil) {
      emote.action.fadeOut(CROSSFADE_SECONDS);
      avatar.emote = null;
    }

    if (avatar.arm) {
      releaseHold(avatar.arm);
    }
    avatar.poser.restore();
    avatar.mixer.update(dt);

    // Sitting is posed *after* the mixer, so it overrides the idle clip's legs.
    avatar.model.position.y = avatar.seated ? -(avatar.loungeSpot?.drop ?? SIT_DROP) : 0;
    if (avatar.seated && avatar.legs) {
      const { model, poser, legs } = avatar;
      // Thighs first: each knee's bend is applied in its (already bent)
      // thigh's space.
      poser.bend(model, legs.upperL, SIT_THIGH);
      poser.bend(model, legs.upperR, SIT_THIGH);
      poser.bend(model, legs.lowerL, SIT_KNEE);
      poser.bend(model, legs.lowerR, SIT_KNEE);
      // Sunk back into a sofa, the head still up to see the room.
      const recline = avatar.loungeSpot?.recline ?? 0;
      poser.bend(model, legs.abdomen, -recline);
      poser.bend(model, legs.neck, recline * 0.7);
    }

    this.updateHold(avatar, dt);
  }

  /** Brings the right arm up to hold the gadget (or back down once it's
   * gone), on top of the clip: an emote gets the whole arm back. */
  private updateHold(avatar: Avatar, dt: number): void {
    const holding = !!avatar.heldItemMesh;
    const k = smoothingFactor(dt, HOLD_HALF_LIFE);
    avatar.holdWeight = ease(avatar.holdWeight, holding && !avatar.emote ? 1 : 0, k);
    avatar.gripWeight = ease(avatar.gripWeight, holding ? 1 : 0, k);
    // A gesture: how far into it, or gone once it's over. An emote wins.
    let gesture = 0;
    if (avatar.gesture) {
      const weight = gestureWeight(avatar.gesture.kind, this.clock - avatar.gesture.at);
      if (weight === null || avatar.emote) avatar.gesture = null;
      else gesture = weight;
    }
    const kind = avatar.heldItemKind ?? avatar.holdKind;
    if (avatar.arm && avatar.model && kind && (avatar.holdWeight > 0 || avatar.gripWeight > 0)) {
      const hold = HOLDS[kind];
      let pose = avatar.seated ? hold.seated : hold.standing;
      // The hand that holds something can't also dip into the popcorn or
      // stroke the cat.
      if (avatar.gesture && (avatar.gesture.kind === 'sip' || avatar.gesture.kind === 'cheers')) {
        pose = blendPose(pose, GESTURE_POSES[avatar.gesture.kind], gesture);
      }
      poseHold(avatar.model, avatar.arm, pose, avatar.holdWeight, avatar.gripWeight);
      if (avatar.heldItemMesh) {
        placeInHand(avatar.heldItemMesh, hold, pose);
      }
    } else if (avatar.arm && avatar.model && avatar.gesture && gesture > 0) {
      const empty = avatar.gesture.kind;
      if (empty === 'snack' || empty === 'pet') {
        poseHold(avatar.model, avatar.arm, emptyHandPose(empty), gesture, gesture);
      }
    }
    // A hot drink steams.
    for (const wisp of avatar.heldItemParts?.steam ?? []) {
      const { rise, size, opacity } = steamWisp(this.clock, wisp.userData.phase as number);
      wisp.position.y = 0.065 + rise;
      wisp.scale.setScalar(size);
      (wisp.material as THREE.SpriteMaterial).opacity = opacity * avatarOpacity(avatar);
    }
    const flash = avatar.heldItemParts?.flash;
    if (flash) {
      const left = FLASH_SECONDS - (this.clock - avatar.flashAt);
      flash.emissiveIntensity = left > 0 ? FLASH_GLOW * (left / FLASH_SECONDS) ** 2 : 0;
    }
  }

  private detachModel(avatar: Avatar): void {
    if (!avatar.model) {
      return;
    }
    avatar.mixer?.stopAllAction();
    avatar.group.remove(avatar.model);
    avatar.materials.forEach((material) => material.dispose());
    avatar.model = null;
    avatar.mixer = null;
    avatar.actions = new Map();
    avatar.materials = [];
    avatar.legs = null;
    avatar.arm = null;
    avatar.emote = null;
  }

  private updateSpeech(avatar: Avatar): void {
    const speech = avatar.speech;
    if (!speech) {
      return;
    }
    const remaining = speech.until - this.clock;
    if (remaining <= 0) {
      this.clearSpeech(avatar);
      return;
    }
    speech.bubble.sprite.position.y = avatar.nameTag.sprite.position.y + SPEECH_ABOVE_TAG;
    speech.bubble.opacity = Math.min(1, remaining / SPEECH_FADE_SECONDS);
  }

  private clearSpeech(avatar: Avatar): void {
    if (avatar.speech) {
      avatar.group.remove(avatar.speech.bubble.sprite);
      avatar.speech.bubble.dispose();
      avatar.speech = null;
    }
  }

  private removeAvatar(avatar: Avatar): void {
    avatar.loadToken += 1; // cancel any in-flight model load
    avatar.heldItemLoadToken += 1; // cancel any in-flight gadget-mesh load
    this.detachModel(avatar);
    this.clearSpeech(avatar);
    avatar.nameTag.dispose();
    this.group.remove(avatar.group);
    this.avatars.delete(avatar.id);
  }
}

const scratchModel = new THREE.Quaternion();
const scratchParent = new THREE.Quaternion();
const scratchAxis = new THREE.Vector3();

/** Rotates a bone about the *character's* side-to-side axis (its local +X —
 * the models face +Z), converted into the bone's parent space. The rig's own
 * bone axes aren't aligned with the body, so bending about a bone-local axis
 * would swing the leg sideways instead of forward. */
function bendAboutModelAxis(
  model: THREE.Object3D,
  target: THREE.Object3D | null,
  angle: number,
): void {
  if (!target?.parent) {
    return;
  }
  model.getWorldQuaternion(scratchModel);
  target.parent.getWorldQuaternion(scratchParent).invert();
  scratchAxis.copy(X_AXIS).applyQuaternion(scratchModel).applyQuaternion(scratchParent).normalize();
  target.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(scratchAxis, angle));
}

/** Eases `value` toward `target`, settling exactly once it's close. */
function ease(value: number, target: number, k: number): number {
  const next = value + (target - value) * k;
  return Math.abs(target - next) < 0.001 ? target : next;
}

/** The flashlight's glass glows while it's on. */
function lightLens(avatar: Avatar): void {
  const lens = avatar.heldItemParts?.lens;
  if (lens) {
    lens.emissiveIntensity = avatar.flashlightOn ? LENS_GLOW : 0;
  }
}

/** How solid the avatar is: a player still reconnecting is a ghost. */
function avatarOpacity(avatar: Avatar): number {
  return avatar.connected ? 1 : AWAY_OPACITY;
}

function applyPresence(avatar: Avatar): void {
  for (const material of [...avatar.materials, ...(avatar.heldItemParts?.materials ?? [])]) {
    material.transparent = !avatar.connected;
    material.opacity = avatar.connected ? 1 : AWAY_OPACITY;
    material.depthWrite = avatar.connected;
    material.needsUpdate = true;
  }
}
