import * as THREE from 'three';
import type { Drink, LoungeSeat, Player } from '@custom-tabletop/shared';
import { isPlayerMuted } from '../audioMix.js';
import { StepCounter, surfaceAt, type FloorArea } from '../footsteps.js';
import {
  playChairCreak,
  playChimeStrike,
  playCushion,
  playMugDown,
  playPour,
  playDoorClose,
  playDoorCreak,
  playFootstep,
  playKnock,
  playSwitchClick,
  playTick,
} from '../roomSounds.js';
import { placeSound, type Listener } from '../spatialAudio.js';
import { GrandfatherClock } from './GrandfatherClock.js';
import { LightSwitch, LIGHT_SWITCH_POSITION } from './LightSwitch.js';
import { LOUNGE_SPOTS } from './loungeSeats.js';
import type { PlayerAvatars } from './PlayerAvatars.js';
import { LAMP_POSITION } from './RoomLamp.js';
import { TEA_SET } from './refreshmentMeshes.js';
import { RockingChair } from './RockingChair.js';
import { RoomDoor } from './RoomDoor.js';
import type { RoomAsset } from './RoomLoader.js';

/** Your own footsteps, a little quieter than the room's other sounds. */
const OWN_STEP_VOLUME = 0.5;
/** Seconds from the knock to the door opening, the arrival stepping in,
 * and the door falling shut behind them. */
const DOOR_OPENS_AFTER = 0.85;
const ARRIVAL_STEPS_IN_AFTER = 1.15;
const DOOR_CLOSES_AFTER = 3.6;
/** Seconds between the clock's strikes. */
const STRIKE_GAP = 2.2;

/**
 * The room's small signs of life (docs/decisions.md, "The cozy room"):
 * footsteps on the boards (your own and everyone else's), the grandfather
 * clock keeping time, a knock at the door when someone arrives — who then
 * walks in — the light switch by the door, and the seats away from the
 * table: the cushions sighing as someone sits, the rocking chair rocking.
 * RoomView makes one when the room has loaded and drives it every frame.
 */
export class RoomLife {
  private readonly door: RoomDoor | null;
  private readonly clock: GrandfatherClock | null;
  private readonly lightSwitch: LightSwitch;
  private readonly rugs: FloorArea[];
  private readonly ownSteps = new StepCounter();
  private readonly othersSteps = new Map<string, StepCounter>();
  private known: Set<string> | null = null;
  /** Who sits where away from the table, as of the last sync. */
  private lounging = new Map<string, LoungeSeat>();
  /** Who has a drink in hand, as of the last sync. */
  private drinks = new Map<string, Drink>();
  readonly rockingChair: RockingChair;
  private time = 0;
  private readonly timers: { at: number; run: () => void }[] = [];
  private listener: Listener = { x: 0, z: 0, yaw: 0 };

  constructor(
    scene: THREE.Scene,
    room: RoomAsset,
    private readonly avatars: PlayerAvatars,
    private readonly selfId: string,
  ) {
    this.door = RoomDoor.fromRoom(room.object3D);
    this.rugs = room.rugs;
    this.lightSwitch = new LightSwitch(scene);
    const rocking = LOUNGE_SPOTS['rocking-chair'];
    this.rockingChair = new RockingChair(room.object3D, rocking, (amount) =>
      playChairCreak(
        placeSound(this.listener, rocking, 0.8, 7),
        0.9 + Math.random() * 0.2 * amount,
      ),
    );
    this.clock = GrandfatherClock.fromRoom(room.object3D, {
      tick: (tock) => {
        if (this.clock) playTick(placeSound(this.listener, this.clock.spot, 0.6, 5.5), tock);
      },
      chime: (strikes) => {
        for (let i = 0; i < strikes; i++) {
          this.after(i * STRIKE_GAP, () => {
            if (this.clock) playChimeStrike(placeSound(this.listener, this.clock.spot, 2, 14));
          });
        }
      },
    });
  }

  /** Who's at the table: anyone new since last time knocks and comes in;
   * anyone who just sat down on the sofa or a chair is heard doing it. */
  syncPlayers(players: readonly Player[]): void {
    const ids = new Set(players.map((player) => player.id));
    const known = this.known;
    this.known = ids;
    const lounging = new Map<string, LoungeSeat>();
    for (const player of players) {
      if (player.lounge) lounging.set(player.id, player.lounge);
    }
    const before = this.lounging;
    this.lounging = lounging;
    const drinks = new Map<string, Drink>();
    for (const player of players) {
      if (player.carrying) drinks.set(player.id, player.carrying);
    }
    const hadDrinks = this.drinks;
    this.drinks = drinks;
    if (known) {
      // A cup poured at the tea set; a mug set down (where they are).
      for (const [id, drink] of drinks) {
        if (hadDrinks.get(id) !== drink && !isPlayerMuted(id)) {
          playPour(placeSound(this.listener, TEA_SET, 1, 8));
        }
      }
      for (const id of hadDrinks.keys()) {
        if (drinks.has(id) || !ids.has(id) || isPlayerMuted(id)) continue;
        const where =
          id === this.selfId
            ? this.listener
            : (this.avatars.walkers().find((walker) => walker.id === id) ?? this.listener);
        playMugDown(placeSound(this.listener, where, 1, 7));
      }
      for (const [id, seat] of lounging) {
        if (before.get(id) === seat || isPlayerMuted(id)) continue;
        const spot = LOUNGE_SPOTS[seat];
        const place = placeSound(this.listener, spot, 1, 8);
        if (spot.soft) playCushion(place);
        else playChairCreak(place, 0.8);
      }
    }
    // The first look is just who's already here — nobody is arriving.
    if (!known) return;
    for (const player of players) {
      if (!known.has(player.id) && player.id !== this.selfId) this.arrive(player.id);
    }
  }

  /** The room light (the switch by the door): the lever, and a click
   * unless this is just the state we came in to. */
  setLightOn(on: boolean, quietly = false): void {
    this.lightSwitch.setOn(on);
    if (!quietly) playSwitchClick(placeSound(this.listener, LIGHT_SWITCH_POSITION, 1, 7));
  }

  /** Hangs something on the door (the winter wreath), swinging with it. */
  hangOnDoor(object: THREE.Object3D): void {
    this.door?.hang(object);
  }

  /** The reading lamp's switch clicking over. */
  readingLampSwitched(): void {
    playSwitchClick(placeSound(this.listener, LAMP_POSITION, 1, 7));
  }

  update(dt: number, camera: THREE.Camera, yaw: number, walking: boolean): void {
    this.time += dt;
    this.listener = { x: camera.position.x, z: camera.position.z, yaw };
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const timer = this.timers[i]!;
      if (this.time >= timer.at) {
        this.timers.splice(i, 1);
        timer.run();
      }
    }
    this.clock?.update();
    this.door?.update(dt);
    this.rockingChair.update(dt, [...this.lounging.values()].includes('rocking-chair'));

    // Your own feet: only while walking about (not sitting, not warping).
    let own = null;
    if (walking) own = this.ownSteps.advance(camera.position.x, camera.position.z, dt);
    else this.ownSteps.reset();
    if (own) {
      playFootstep(
        { volume: OWN_STEP_VOLUME, pan: 0 },
        surfaceAt(camera.position.x, camera.position.z, this.rugs),
        own.running,
      );
    }
    // Everyone else's, from where they are.
    const seen = new Set<string>();
    for (const walker of this.avatars.walkers()) {
      seen.add(walker.id);
      let counter = this.othersSteps.get(walker.id);
      if (!counter) {
        counter = new StepCounter();
        this.othersSteps.set(walker.id, counter);
      }
      let step = null;
      if (walker.seated || !walker.visible) counter.reset();
      else step = counter.advance(walker.x, walker.z, dt);
      if (step && !isPlayerMuted(walker.id)) {
        playFootstep(
          placeSound(this.listener, walker, 0.8, 9),
          surfaceAt(walker.x, walker.z, this.rugs),
          step.running,
        );
      }
    }
    for (const id of this.othersSteps.keys()) {
      if (!seen.has(id)) this.othersSteps.delete(id);
    }
  }

  dispose(): void {
    this.lightSwitch.dispose();
    this.door?.dispose();
    this.timers.length = 0;
  }

  /** Knock, knock — the door opens, they step in, it falls shut. */
  private arrive(playerId: string): void {
    const door = this.door;
    if (!door) return;
    const at = door.soundSpot;
    playKnock(placeSound(this.listener, at, 1.5, 12));
    this.after(DOOR_OPENS_AFTER, () => {
      door.setOpen(true);
      playDoorCreak(placeSound(this.listener, at, 1.5, 11));
    });
    this.avatars.enter(
      playerId,
      { x: door.threshold.x, z: door.threshold.z },
      ARRIVAL_STEPS_IN_AFTER,
    );
    // A second arrival while it's open keeps it open for them too.
    this.timers
      .filter((timer) => timer.run === this.closeDoor)
      .forEach((timer) => this.timers.splice(this.timers.indexOf(timer), 1));
    this.after(DOOR_CLOSES_AFTER, this.closeDoor);
  }

  private readonly closeDoor = (): void => {
    if (!this.door) return;
    this.door.setOpen(false);
    this.after(0.75, () => {
      if (this.door) playDoorClose(placeSound(this.listener, this.door.soundSpot, 1.5, 11));
    });
  };

  private after(seconds: number, run: () => void): void {
    this.timers.push({ at: this.time + seconds, run });
  }
}
