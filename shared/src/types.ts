/**
 * Server-authoritative session state and the data shapes it's made of.
 *
 * Source: docs/engineering/architecture.md ("Client State" section — the
 * original spec's GameState/Scene/Player interfaces, carried over verbatim).
 * `Character`, `Drawing`, `Dice`, and `SoundState` were referenced there but
 * left undefined; these are placeholder shapes, expected to grow when the
 * milestone that actually uses them lands (see docs/roadmap.md).
 */

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Character {
  id: string;
  name: string;
}

export interface Drawing {
  id: string;
  sceneId: string;
  playerId: string;
  points: Vector3[];
}

export interface Dice {
  id: string;
  sceneId: string;
  ownerId: string;
  result: number | null;
}

export interface SoundState {
  id: string;
  name: string;
  playing: boolean;
}

export interface Player {
  id: string;
  name: string;

  character: Character;

  position: Vector3;

  muted: boolean;
}

export interface Scene {
  id: string;
  name: string;
  backgroundImage: string;

  drawings: Drawing[];
}

export interface GameState {
  sessionId: string;
  hostId: string;
  activeSceneId: string;

  scenes: Scene[];

  players: Player[];

  drawings: Drawing[];

  dice: Dice[];

  soundboard: SoundState[];
}
