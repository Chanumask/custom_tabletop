import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import {
  playerColorHex,
  type EmoteId,
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
import { NameTag } from './nameTag.js';
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

interface LegBones {
  upperL: THREE.Object3D | null;
  upperR: THREE.Object3D | null;
  lowerL: THREE.Object3D | null;
  lowerR: THREE.Object3D | null;
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
  connected: boolean;
  nameTag: NameTag;
  /** What they just said in chat, until `until` (on the avatars' clock). */
  speech: { bubble: SpeechBubble; until: number } | null;
  loadToken: number;
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

  constructor(
    scene: THREE.Scene,
    private readonly characters: CharacterSource,
    private readonly seats: Seat[] = [],
  ) {
    this.group.name = 'player-avatars';
    scene.add(this.group);
  }

  sync(players: Player[], selfId: string): void {
    const others = players.filter((player) => player.id !== selfId);

    for (const player of others) {
      let avatar = this.avatars.get(player.id);
      if (!avatar) {
        avatar = this.createAvatar(player);
      } else if (avatar.color !== player.color) {
        avatar.color = player.color;
        this.loadModel(avatar);
      }

      avatar.target = { x: player.position.x, z: player.position.z, yaw: player.rotationY };
      avatar.seated = player.seated;
      avatar.seat =
        player.seated && player.seatIndex !== null ? (this.seats[player.seatIndex] ?? null) : null;
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

  /** A live `player:move` for someone — becomes the interpolation target. */
  updateOne(playerId: string, position: Vector3, rotationY: number): void {
    const avatar = this.avatars.get(playerId);
    if (avatar) {
      avatar.target = { x: position.x, z: position.z, yaw: rotationY };
    }
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

  /** The world object for a player's avatar (tests/debugging). */
  objectFor(playerId: string): THREE.Group | undefined {
    return this.avatars.get(playerId)?.group;
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
      connected: player.connected,
      nameTag,
      speech: null,
      loadToken: 0,
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
        };
        avatar.locomotion = null;
        avatar.animating = false;
        avatar.group.add(model);
        applyPresence(avatar);
      },
      (error: unknown) => {
        console.error(`Failed to load the ${color} character model:`, error);
      },
    );
  }

  private updateAvatar(avatar: Avatar, dt: number): void {
    const previous = { x: avatar.current.x, z: avatar.current.z };
    if (avatar.seated && avatar.seat) {
      const { x, z, yaw } = avatar.seat;
      avatar.current = {
        x: x + Math.sin(yaw) * SIT_FORWARD,
        z: z + Math.cos(yaw) * SIT_FORWARD,
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

    avatar.mixer.update(dt);

    // Sitting is posed *after* the mixer, so it overrides the idle clip's legs.
    avatar.model.position.y = avatar.seated ? -SIT_DROP : 0;
    if (avatar.seated && avatar.legs) {
      // Thighs first: each knee's bend is applied in its (already bent)
      // thigh's space.
      bendAboutModelAxis(avatar.model, avatar.legs.upperL, SIT_THIGH);
      bendAboutModelAxis(avatar.model, avatar.legs.upperR, SIT_THIGH);
      bendAboutModelAxis(avatar.model, avatar.legs.lowerL, SIT_KNEE);
      bendAboutModelAxis(avatar.model, avatar.legs.lowerR, SIT_KNEE);
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

function applyPresence(avatar: Avatar): void {
  for (const material of avatar.materials) {
    material.transparent = !avatar.connected;
    material.opacity = avatar.connected ? 1 : AWAY_OPACITY;
    material.depthWrite = avatar.connected;
    material.needsUpdate = true;
  }
}
