import {
  DEFAULT_SPAWN_POSITION,
  type Dice,
  type GameState,
  type Player,
  type Point2D,
  type Scene,
  type Vector3,
} from '@custom-tabletop/shared';

const DEFAULT_SCENE_ID = 'default';
const DIE_FACES = 6;

/** Shared by every mutation that's infrequent/authorized enough to ack with
 * the full new GameState rather than a fire-and-forget delta (scene:* and
 * dice:*, unlike player:move/drawing:*). */
export type GameStateMutationResult = { ok: true; state: GameState } | { ok: false; error: string };

/**
 * The server-authoritative registry of live sessions. Trusts its inputs are
 * already validated (see validation.ts) — non-empty, trimmed strings.
 *
 * Design calls (see docs/decisions.md for the full reasoning):
 * - A session is created implicitly by its first joiner, who becomes host
 *   (GameState.hostId). There's no separate session:create event.
 * - Host/player role isn't stored per-player — it's derived by comparing
 *   Player.id to GameState.hostId. Host migration (reassigning hostId if the
 *   host leaves) is out of scope for Milestone 2: hostId can end up pointing
 *   at a departed player, and callers must treat that as "no active host"
 *   rather than assume it always resolves to a real player.
 * - Rejoining with a playerId already in the session is a no-op merge, not
 *   a duplicate — this is what makes reconnect work.
 */
export class SessionStore {
  private sessions = new Map<string, GameState>();

  join(sessionId: string, playerId: string, playerName: string): GameState {
    let state = this.sessions.get(sessionId);

    if (!state) {
      state = createEmptySession(sessionId, playerId);
      this.sessions.set(sessionId, state);
    }

    const alreadyPresent = state.players.some((player) => player.id === playerId);
    if (!alreadyPresent) {
      state.players.push(createPlayer(playerId, playerName));
    }
    // Rejoining with the same playerId intentionally doesn't rename the
    // existing Player record — name changes aren't a Milestone-2 concern.

    return state;
  }

  /** Returns the session's new state, or undefined if it no longer exists (deleted because it's now empty, or never existed). */
  leave(sessionId: string, playerId: string): GameState | undefined {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return undefined;
    }

    state.players = state.players.filter((player) => player.id !== playerId);

    if (state.players.length === 0) {
      this.sessions.delete(sessionId);
      return undefined;
    }

    return state;
  }

  get(sessionId: string): GameState | undefined {
    return this.sessions.get(sessionId);
  }

  /** Updates a player's position/rotation in place. Returns false (no-op)
   * for an unknown session or a player not in it, rather than throwing —
   * a late-arriving move for a session/player that's already gone is a
   * normal race, not an error. */
  move(sessionId: string, playerId: string, position: Vector3, rotationY: number): boolean {
    const state = this.sessions.get(sessionId);
    const player = state?.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      return false;
    }

    player.position = position;
    player.rotationY = rotationY;
    return true;
  }

  /** Host-only. Adds a new scene; does not switch to it (see `changeScene`) —
   * separate operations because the spec lists them as separate events. */
  createScene(
    sessionId: string,
    playerId: string,
    sceneId: string,
    name: string,
    backgroundImage: string,
  ): GameStateMutationResult {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { ok: false, error: 'Session not found.' };
    }
    if (state.hostId !== playerId) {
      return { ok: false, error: 'Only the host can create a scene.' };
    }
    if (state.scenes.some((scene) => scene.id === sceneId)) {
      return { ok: false, error: 'A scene with that id already exists.' };
    }

    state.scenes.push({ id: sceneId, name, backgroundImage, drawings: [] });
    return { ok: true, state };
  }

  /** Host-only. Switches which existing scene is active. */
  changeScene(sessionId: string, playerId: string, sceneId: string): GameStateMutationResult {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { ok: false, error: 'Session not found.' };
    }
    if (state.hostId !== playerId) {
      return { ok: false, error: 'Only the host can change the active scene.' };
    }
    if (!state.scenes.some((scene) => scene.id === sceneId)) {
      return { ok: false, error: 'Scene not found.' };
    }

    state.activeSceneId = sceneId;
    return { ok: true, state };
  }

  /** Host-only. Patches a scene's name and/or background image in place —
   * this is what "the host swaps the map" actually calls (docs/decisions.md,
   * Milestone 5): updating the already-active default scene's
   * `backgroundImage`, rather than creating and switching to a new scene. */
  updateScene(
    sessionId: string,
    playerId: string,
    sceneId: string,
    patch: { name?: string; backgroundImage?: string },
  ): GameStateMutationResult {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { ok: false, error: 'Session not found.' };
    }
    if (state.hostId !== playerId) {
      return { ok: false, error: 'Only the host can update a scene.' };
    }
    const scene = state.scenes.find((candidate) => candidate.id === sceneId);
    if (!scene) {
      return { ok: false, error: 'Scene not found.' };
    }

    if (patch.name !== undefined) {
      scene.name = patch.name;
    }
    if (patch.backgroundImage !== undefined) {
      scene.backgroundImage = patch.backgroundImage;
    }
    return { ok: true, state };
  }

  /** Not host-gated — any player can draw. Starts a new stroke with its
   * first point. Returns false (no-op) for an unknown session/scene. */
  startDrawing(
    sessionId: string,
    sceneId: string,
    drawingId: string,
    playerId: string,
    point: Point2D,
  ): boolean {
    const scene = this.sessions
      .get(sessionId)
      ?.scenes.find((candidate) => candidate.id === sceneId);
    if (!scene) {
      return false;
    }

    scene.drawings.push({ id: drawingId, sceneId, playerId, points: [point] });
    return true;
  }

  /** Appends a point to an in-progress stroke. Returns false (no-op) if the
   * drawingId isn't found — a late point for an already-deleted stroke is a
   * normal race, not an error. */
  appendDrawingPoint(sessionId: string, drawingId: string, point: Point2D): boolean {
    const state = this.sessions.get(sessionId);
    const drawing = state?.scenes
      .flatMap((scene) => scene.drawings)
      .find((candidate) => candidate.id === drawingId);
    if (!drawing) {
      return false;
    }

    drawing.points.push(point);
    return true;
  }

  deleteDrawing(sessionId: string, sceneId: string, drawingId: string): boolean {
    const scene = this.sessions
      .get(sessionId)
      ?.scenes.find((candidate) => candidate.id === sceneId);
    if (!scene) {
      return false;
    }

    const before = scene.drawings.length;
    scene.drawings = scene.drawings.filter((drawing) => drawing.id !== drawingId);
    return scene.drawings.length < before;
  }

  /** Not host-gated — any player can spawn a die. */
  spawnDice(
    sessionId: string,
    playerId: string,
    diceId: string,
    position: Vector3,
  ): GameStateMutationResult {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { ok: false, error: 'Session not found.' };
    }
    if (state.dice.some((die) => die.id === diceId)) {
      return { ok: false, error: 'A die with that id already exists.' };
    }

    const die: Dice = { id: diceId, ownerId: playerId, position, result: null };
    state.dice.push(die);
    return { ok: true, state };
  }

  /** Not host-gated. The result is decided here, server-side, with
   * `Math.random()` — never trusted from the client, so a roll can't be
   * faked (docs/engineering/architecture.md's "Autorität und
   * Synchronisierung" lists dice as needing server validation). */
  rollDice(sessionId: string, diceId: string): GameStateMutationResult {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { ok: false, error: 'Session not found.' };
    }
    const die = state.dice.find((candidate) => candidate.id === diceId);
    if (!die) {
      return { ok: false, error: 'Die not found.' };
    }

    die.result = Math.floor(Math.random() * DIE_FACES) + 1;
    return { ok: true, state };
  }

  /** Not host-gated — any player can remove a die. */
  removeDice(sessionId: string, diceId: string): GameStateMutationResult {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { ok: false, error: 'Session not found.' };
    }
    const before = state.dice.length;
    state.dice = state.dice.filter((die) => die.id !== diceId);
    if (state.dice.length === before) {
      return { ok: false, error: 'Die not found.' };
    }

    return { ok: true, state };
  }
}

function createEmptySession(sessionId: string, hostId: string): GameState {
  return {
    sessionId,
    hostId,
    activeSceneId: DEFAULT_SCENE_ID,
    scenes: [createDefaultScene()],
    players: [],
    dice: [],
    soundboard: [],
  };
}

/** Every session starts with one scene, auto-created the same way the
 * session itself is (implicitly, on first join) — mirrors the M2 "implicit
 * session creation" pattern so the host can set a background image or a
 * player can draw immediately, without a separate "create your first scene"
 * step. `scene:create` still exists for adding further scenes (Milestone 5
 * scope note in docs/decisions.md: implemented and tested, not yet wired to
 * a multi-scene UI). */
function createDefaultScene(): Scene {
  return { id: DEFAULT_SCENE_ID, name: 'Map', backgroundImage: '', drawings: [] };
}

function createPlayer(id: string, name: string): Player {
  return {
    id,
    name,
    character: { id, name }, // character customization isn't scoped yet; the player stands in for their own character for now
    position: { ...DEFAULT_SPAWN_POSITION }, // overwritten by the client's first player:move once it joins (Milestone 4)
    rotationY: 0,
    muted: false,
  };
}
