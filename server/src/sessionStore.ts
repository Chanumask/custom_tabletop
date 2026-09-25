import { randomUUID } from 'node:crypto';
import { uploadNameFromUrl } from './uploadStorage.js';
import { hashSecret, newHostKey, secretsMatch, type SavedTable } from './tableArchive.js';
import {
  BUILTIN_SOUND_PRESETS,
  appendLogEntry,
  type DiceNotation,
  type LogEntry,
  type LoggedDie,
  MAX_PLAYERS_PER_SESSION,
  PLAYER_COLORS,
  SOUNDBOARD_SLOT_COUNT,
  emptyWhiteboard,
  spawnPointFor,
  parseYouTubeUrl,
  clampToTable,
  CLIP_LOCKED_ERROR,
  SECRET_DICE_HOST_ONLY_ERROR,
  DEFAULT_PERMISSIONS,
  MAX_SCENES_PER_SESSION,
  HOST_ONLY_ERROR,
  REMOVED_FROM_TABLE_ERROR,
  TABLE_LOCKED_ERROR,
  type ClearTarget,
  type RoomTheme,
  type TablePermission,
  type ClipAction,
  type Dice,
  type GameState,
  type Player,
  type PlayerColorId,
  type SessionPeekResponse,
  type Point2D,
  type Scene,
  type Vector3,
  DIE_FACES,
  MAX_DICE_PER_SESSION,
  type DieKind,
} from '@custom-tabletop/shared';

const DEFAULT_SCENE_ID = 'default';

/** A table everyone has just left, as it was — for saving (tableArchive.ts). */
export interface EmptiedTable {
  state: GameState;
  hostKey: string;
  /** Who hosted it last (the players are gone by now). */
  hostName: string | null;
}

export interface SessionStoreOptions {
  /** Called when the last player leaves, just before the table is dropped
   * from memory — the moment to save it. */
  onEmptied?: (table: EmptiedTable) => void;
}

/** Shared by every mutation that's infrequent/authorized enough to ack with
 * the full new GameState rather than a fire-and-forget delta (scene:* and
 * dice:*, unlike player:move/drawing:*). */
export type GameStateMutationResult = { ok: true; state: GameState } | { ok: false; error: string };

/** A new log entry, or why it couldn't be made. */
export type LogResult = { ok: true; entry: LogEntry } | { ok: false; error: string };

/** A fresh id and timestamp for a log entry. */
function stamp(): { id: string; at: number } {
  return { id: randomUUID(), at: Date.now() };
}

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
 *   a duplicate — this is what makes reconnect work. Because playerIds are
 *   public (broadcast in every GameState), a rejoin must also present the
 *   same secret credential the player first joined with (`authorizeJoin`),
 *   kept here — never in GameState, so it's never broadcast.
 * - When the host leaves, the host role passes to the longest-present
 *   remaining player (preferring a connected one) rather than dangling at
 *   an absent id with nobody able to perform host actions.
 */
export class SessionStore {
  private sessions = new Map<string, GameState>();
  /** sessionId -> playerId -> SHA-256 of the secret credential that player
   * joined with (only hashes are kept, so a saved table holds no tokens). */
  private credentials = new Map<string, Map<string, string>>();
  /** sessionId -> the table's host key (reopens it once everyone has left;
   * never in GameState, so never broadcast). */
  private hostKeys = new Map<string, string>();
  /** sessionId -> players the host removed: kept out for as long as the
   * table runs (host.ts). Never in GameState, never saved. */
  private removedPlayers = new Map<string, Set<string>>();

  constructor(private readonly options: SessionStoreOptions = {}) {}

  /** Whether `credential` may (re)join `sessionId` as `playerId`: always true
   * for a brand-new player id, and for an existing one only with the same
   * credential it originally joined with. A player joined without any
   * credential (only possible via direct store calls, e.g. unit tests) has
   * nothing to check against and is allowed. */
  authorizeJoin(sessionId: string, playerId: string, credential: string): boolean {
    const known = this.credentials.get(sessionId)?.get(playerId);
    return known === undefined || secretsMatch(known, hashSecret(credential));
  }

  /** The table's host key — for its host only (the join ack, the host link). */
  hostKeyOf(sessionId: string): string | undefined {
    return this.hostKeys.get(sessionId);
  }

  /** Every table currently in memory (in play, or reopened). */
  liveSessionIds(): string[] {
    return [...this.sessions.keys()];
  }

  /** A table's saveable parts (tableArchive.ts), or undefined if unknown. */
  snapshot(sessionId: string): Omit<SavedTable, 'format' | 'lastActiveAt'> | undefined {
    const state = this.sessions.get(sessionId);
    const hostKey = this.hostKeys.get(sessionId);
    if (!state || !hostKey) {
      return undefined;
    }
    return {
      sessionId,
      hostKey,
      credentialHashes: Object.fromEntries(this.credentials.get(sessionId) ?? []),
      state,
    };
  }

  /**
   * Puts a saved table back in play: after a restart (its players are
   * restored as away, to rejoin as themselves), or reopened by its host (no
   * players; the next join takes over as host — see `join`). Saves from an
   * older version get today's defaults for anything they lack.
   */
  restore(
    saved: Pick<SavedTable, 'sessionId' | 'hostKey' | 'credentialHashes' | 'state'>,
  ): GameState {
    const state = normalizeRestoredState(saved.sessionId, saved.state);
    this.sessions.set(saved.sessionId, state);
    this.hostKeys.set(saved.sessionId, saved.hostKey);
    this.credentials.set(
      saved.sessionId,
      new Map(
        Object.entries(saved.credentialHashes).filter(([playerId]) =>
          state.players.some((player) => player.id === playerId),
        ),
      ),
    );
    return state;
  }

  /** Why `playerId` can't join `sessionId` right now, or null if they can:
   * a returning player always can; a new one only if the host hasn't
   * removed them, the table isn't locked and there's a free seat. */
  admissionError(sessionId: string, playerId: string): string | null {
    const state = this.sessions.get(sessionId);
    if (!state || state.players.some((player) => player.id === playerId)) {
      return null;
    }
    if (this.removedPlayers.get(sessionId)?.has(playerId)) {
      return REMOVED_FROM_TABLE_ERROR;
    }
    // An empty table is one its host is reopening (their host key checked).
    if (state.locked && state.players.length > 0) {
      return TABLE_LOCKED_ERROR;
    }
    if (state.players.length >= MAX_PLAYERS_PER_SESSION) {
      return `That session is full (${MAX_PLAYERS_PER_SESSION} players max).`;
    }
    return null;
  }

  /** A read-only look at a session for the join screen (`session:peek`). */
  peek(sessionId: string): SessionPeekResponse {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { exists: false, playerCount: 0, hostName: null, takenColors: [] };
    }
    return {
      exists: true,
      playerCount: state.players.length,
      hostName: state.players.find((player) => player.id === state.hostId)?.name ?? null,
      takenColors: state.players.map((player) => player.color),
      ...(state.locked ? { locked: true } : {}),
    };
  }

  /** Callers check `admissionError` first — joining a full session as a new
   * player is a caller bug, and throws rather than silently exceeding six. */
  join(
    sessionId: string,
    playerId: string,
    playerName: string,
    credential?: string,
    preferredColor?: PlayerColorId,
  ): GameState {
    let state = this.sessions.get(sessionId);
    const opening = !state;
    // A saved table its host just reopened (restored with nobody in it).
    const reopening = !!state && state.players.length === 0;

    if (!state) {
      state = createEmptySession(sessionId, playerId);
      this.sessions.set(sessionId, state);
      this.hostKeys.set(sessionId, newHostKey());
    }
    if (reopening) {
      state.hostId = playerId;
      // Last time's lock was about last time's group; the rules stay.
      state.locked = false;
    }

    const existing = state.players.find((player) => player.id === playerId);
    if (existing) {
      existing.connected = true;
    } else {
      const color = pickColor(state, preferredColor);
      if (!color) {
        throw new Error(`session ${sessionId} is full`);
      }
      state.players.push(createPlayer(playerId, playerName, color));
      addSystemEntry(
        state,
        opening
          ? `${playerName} opened the table`
          : reopening
            ? `${playerName} reopened the table`
            : `${playerName} joined the table`,
      );
    }
    // Rejoining with the same playerId intentionally doesn't rename the
    // existing Player record — renaming is its own explicit action.

    if (credential !== undefined) {
      let sessionCredentials = this.credentials.get(sessionId);
      if (!sessionCredentials) {
        sessionCredentials = new Map();
        this.credentials.set(sessionId, sessionCredentials);
      }
      if (!sessionCredentials.has(playerId)) {
        sessionCredentials.set(playerId, hashSecret(credential));
      }
    }

    return state;
  }

  /** Returns the session's new state, or undefined if it no longer exists (deleted because it's now empty, or never existed). */
  leave(sessionId: string, playerId: string, farewell = 'left the table'): GameState | undefined {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return undefined;
    }

    const leaving = state.players.find((player) => player.id === playerId);
    const hostName =
      state.players.find((player) => player.id === state.hostId)?.name ?? leaving?.name ?? null;
    state.players = state.players.filter((player) => player.id !== playerId);
    delete state.minis[playerId];
    // Their secret dice would otherwise linger, seen by no one.
    state.dice = state.dice.filter((die) => !(die.hidden && die.ownerId === playerId));
    this.credentials.get(sessionId)?.delete(playerId);
    if (leaving) {
      addSystemEntry(state, `${leaving.name} ${farewell}`);
    }

    if (state.players.length === 0) {
      const hostKey = this.hostKeys.get(sessionId);
      if (hostKey) {
        this.options.onEmptied?.({ state, hostKey, hostName });
      }
      this.sessions.delete(sessionId);
      this.credentials.delete(sessionId);
      this.hostKeys.delete(sessionId);
      this.removedPlayers.delete(sessionId);
      return undefined;
    }

    if (state.hostId === playerId) {
      const successor = state.players.find((player) => player.connected) ?? state.players[0]!;
      state.hostId = successor.id;
      addSystemEntry(state, `${successor.name} is now the host`);
    }

    return state;
  }

  /** Marks a player's live presence (see `Player.connected`). Returns the
   * new state, or undefined for an unknown session/player. */
  setConnected(sessionId: string, playerId: string, connected: boolean): GameState | undefined {
    const state = this.sessions.get(sessionId);
    const player = state?.players.find((candidate) => candidate.id === playerId);
    if (!state || !player) {
      return undefined;
    }
    player.connected = connected;
    return state;
  }

  /** The end of a reconnect grace period: removes the player exactly like
   * `leave` would, but only if they're *still* disconnected — a player who
   * came back in the meantime is left alone. `removed: false` means nothing
   * changed. */
  removeIfDisconnected(
    sessionId: string,
    playerId: string,
  ): { removed: boolean; state: GameState | undefined } {
    const player = this.sessions
      .get(sessionId)
      ?.players.find((candidate) => candidate.id === playerId);
    if (!player || player.connected) {
      return { removed: false, state: this.sessions.get(sessionId) };
    }
    return { removed: true, state: this.leave(sessionId, playerId) };
  }

  /** A player changes their own name and/or color. Rejects a color someone
   * else is already wearing. (Inputs are pre-validated — trimmed, in range.) */
  updateProfile(
    sessionId: string,
    playerId: string,
    patch: { name?: string; color?: PlayerColorId },
  ): GameStateMutationResult {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { ok: false, error: 'Session not found.' };
    }
    const player = state.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      return { ok: false, error: 'Player not found.' };
    }
    if (
      patch.color !== undefined &&
      state.players.some((other) => other.id !== playerId && other.color === patch.color)
    ) {
      return { ok: false, error: 'That color is already taken.' };
    }

    if (patch.name !== undefined && patch.name !== player.name) {
      addSystemEntry(state, `${player.name} is now called ${patch.name}`);
      player.name = patch.name;
      player.character.name = patch.name;
    }
    if (patch.color !== undefined) {
      player.color = patch.color;
    }
    return { ok: true, state };
  }

  /** Host-only: hands the host role to another player in the session. */
  transferHost(
    sessionId: string,
    actorId: string,
    targetPlayerId: string,
  ): GameStateMutationResult {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { ok: false, error: 'Session not found.' };
    }
    if (state.hostId !== actorId) {
      return { ok: false, error: 'Only the host can hand over the host role.' };
    }
    const target = state.players.find((player) => player.id === targetPlayerId);
    if (!target) {
      return { ok: false, error: 'Player not found.' };
    }
    state.hostId = targetPlayerId;
    addSystemEntry(state, `${target.name} is now the host`);
    return { ok: true, state };
  }

  /** File names of every uploaded map or sound a live session still
   * refers to — the uploads pruning must never delete (uploadStorage.ts). */
  referencedUploads(): Set<string> {
    const names = new Set<string>();
    const add = (url: string) => {
      const name = uploadNameFromUrl(url);
      if (name) names.add(name);
    };
    for (const state of this.sessions.values()) {
      state.scenes.forEach((scene) => add(scene.backgroundImage));
      state.soundboard.forEach((sound) => add(sound.url));
    }
    return names;
  }

  get(sessionId: string): GameState | undefined {
    return this.sessions.get(sessionId);
  }

  isHost(sessionId: string, playerId: string): boolean {
    return this.sessions.get(sessionId)?.hostId === playerId;
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
    if (state.scenes.length >= MAX_SCENES_PER_SESSION) {
      return {
        ok: false,
        error: `A table holds at most ${MAX_SCENES_PER_SESSION} maps — delete one first.`,
      };
    }

    state.scenes.push({ id: sceneId, name, backgroundImage, gridCells: 0, drawings: [] });
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
    const scene = state.scenes.find((candidate) => candidate.id === sceneId);
    if (!scene) {
      return { ok: false, error: 'Scene not found.' };
    }

    if (state.activeSceneId !== sceneId) {
      state.activeSceneId = sceneId;
      const host = state.players.find((player) => player.id === playerId);
      if (host) addSystemEntry(state, `${host.name} put “${scene.name}” on the table`);
    }
    return { ok: true, state };
  }

  /** Host-only. Removes a map — never the one on the table, never the last. */
  deleteScene(sessionId: string, playerId: string, sceneId: string): GameStateMutationResult {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { ok: false, error: 'Session not found.' };
    }
    if (state.hostId !== playerId) {
      return { ok: false, error: 'Only the host can delete a map.' };
    }
    if (!state.scenes.some((scene) => scene.id === sceneId)) {
      return { ok: false, error: 'Scene not found.' };
    }
    if (state.activeSceneId === sceneId) {
      return { ok: false, error: 'That map is on the table — show another one first.' };
    }
    state.scenes = state.scenes.filter((scene) => scene.id !== sceneId);
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
    patch: { name?: string; backgroundImage?: string; gridCells?: number },
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
    if (patch.gridCells !== undefined) {
      scene.gridCells = patch.gridCells;
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
    color: string,
    width: number,
  ): boolean {
    const scene = this.sessions
      .get(sessionId)
      ?.scenes.find((candidate) => candidate.id === sceneId);
    if (!scene) {
      return false;
    }

    scene.drawings.push({ id: drawingId, sceneId, playerId, points: [point], color, width });
    return true;
  }

  /** Appends a point to an in-progress stroke. Returns false (no-op) if the
   * drawingId isn't found — a late point for an already-deleted stroke is a
   * normal race, not an error — or if `actorId` isn't the stroke's own
   * author (only the player drawing a stroke can extend it; erasing any
   * stroke stays open to everyone via `deleteDrawing`). */
  appendDrawingPoint(
    sessionId: string,
    drawingId: string,
    point: Point2D,
    actorId: string,
  ): boolean {
    const state = this.sessions.get(sessionId);
    const drawing = state?.scenes
      .flatMap((scene) => scene.drawings)
      .find((candidate) => candidate.id === drawingId);
    if (!drawing || drawing.playerId !== actorId) {
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
    kind: DieKind = 'd6',
    hidden = false,
  ): GameStateMutationResult {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { ok: false, error: 'Session not found.' };
    }
    if (hidden && state.hostId !== playerId) {
      return { ok: false, error: SECRET_DICE_HOST_ONLY_ERROR };
    }
    if (state.dice.some((die) => die.id === diceId)) {
      return { ok: false, error: 'A die with that id already exists.' };
    }
    if (state.dice.length >= MAX_DICE_PER_SESSION) {
      return {
        ok: false,
        error: `The table holds at most ${MAX_DICE_PER_SESSION} dice — clear some first.`,
      };
    }

    const die: Dice = {
      id: diceId,
      ownerId: playerId,
      kind,
      position,
      result: null,
      rollCount: 0,
      rolledBy: null,
      ...(hidden ? { hidden: true } : {}),
    };
    state.dice.push(die);
    return { ok: true, state };
  }

  /** Not host-gated. Rolls every listed die together (all or nothing). The
   * results are decided here, server-side, with `Math.random()` — never
   * trusted from the client, so a roll can't be faked
   * (docs/engineering/architecture.md's "Autorität und Synchronisierung"
   * lists dice as needing server validation). */
  rollDice(
    sessionId: string,
    diceIds: string[],
    rolledBy: string | null = null,
    random: () => number = Math.random,
  ): GameStateMutationResult {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { ok: false, error: 'Session not found.' };
    }
    const dice = [...new Set(diceIds)].map((id) =>
      state.dice.find((candidate) => candidate.id === id),
    );
    // Someone else's secret die doesn't exist, as far as anyone else knows.
    if (
      dice.length === 0 ||
      dice.some((die) => !die || (die.hidden && die.ownerId !== rolledBy && rolledBy !== null))
    ) {
      return { ok: false, error: 'Die not found.' };
    }

    for (const die of dice as Dice[]) {
      die.result = Math.floor(random() * DIE_FACES[die.kind]) + 1;
      die.rollCount += 1;
      die.rolledBy = rolledBy;
    }
    const roller = state.players.find((player) => player.id === rolledBy);
    if (roller) {
      // Open dice make a line everyone reads; secret ones a line only the
      // roller does (privacy.ts keeps it from everyone else).
      const open = (dice as Dice[]).filter((die) => !die.hidden);
      const secret = (dice as Dice[]).filter((die) => die.hidden);
      for (const [group, visibleTo] of [
        [open, undefined],
        [secret, roller.id],
      ] as const) {
        if (group.length === 0) continue;
        const logged = group.map((die) => ({ sides: DIE_FACES[die.kind], result: die.result! }));
        state.log = appendLogEntry(state.log, {
          ...stamp(),
          kind: 'roll',
          ...authorOf(roller),
          dice: logged,
          modifier: 0,
          total: logged.reduce((sum, die) => sum + die.result, 0),
          ...(visibleTo ? { visibleTo } : {}),
        });
      }
    }
    return { ok: true, state };
  }

  /** A line of chat from a player (text pre-validated: trimmed, 1..max). */
  chat(sessionId: string, playerId: string, text: string): LogResult {
    const state = this.sessions.get(sessionId);
    const author = state?.players.find((player) => player.id === playerId);
    if (!state || !author) {
      return { ok: false, error: 'Player not found.' };
    }
    const entry: LogEntry = { ...stamp(), kind: 'chat', ...authorOf(author), text };
    state.log = appendLogEntry(state.log, entry);
    return { ok: true, entry };
  }

  /** A typed roll (`/roll 2d6+3`): rolled here, like table dice, so it
   * can't be faked. */
  rollNotation(
    sessionId: string,
    playerId: string,
    notation: DiceNotation,
    random: () => number = Math.random,
  ): LogResult {
    const state = this.sessions.get(sessionId);
    const author = state?.players.find((player) => player.id === playerId);
    if (!state || !author) {
      return { ok: false, error: 'Player not found.' };
    }
    const dice: LoggedDie[] = notation.groups.flatMap((group) =>
      Array.from({ length: Math.abs(group.count) }, () => ({
        sides: group.sides,
        result: Math.floor(random() * group.sides) + 1,
        ...(group.count < 0 ? { subtract: true } : {}),
      })),
    );
    const total =
      dice.reduce((sum, die) => sum + (die.subtract ? -die.result : die.result), 0) +
      notation.modifier;
    const entry: LogEntry = {
      ...stamp(),
      kind: 'roll',
      ...authorOf(author),
      dice,
      modifier: notation.modifier,
      total,
      notation: notation.text,
    };
    state.log = appendLogEntry(state.log, entry);
    return { ok: true, entry };
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

  /** A player can always mute/unmute *themselves* (self-service — like
   * muting your own mic); the host can additionally mute/unmute anyone
   * (moderation). `muted` is a visible status flag only — this app has no
   * voice chat to actually silence (docs/decisions.md, Milestone 7). */
  setMuted(
    sessionId: string,
    actorId: string,
    targetPlayerId: string,
    muted: boolean,
  ): GameStateMutationResult {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { ok: false, error: 'Session not found.' };
    }
    if (actorId !== targetPlayerId && state.hostId !== actorId) {
      return { ok: false, error: 'Only the host can mute another player.' };
    }
    const target = state.players.find((player) => player.id === targetPlayerId);
    if (!target) {
      return { ok: false, error: 'Player not found.' };
    }

    target.muted = muted;
    return { ok: true, state };
  }

  /** Any player: saves the whiteboard. `null` entries (lines the writer
   * didn't touch) are left alone; a line whose text changed is re-attributed
   * to the writer (and takes on their color); clearing a line clears its
   * author too. `lines` is pre-validated (right count and lengths). */
  writeWhiteboard(
    sessionId: string,
    actorId: string,
    lines: (string | null)[],
  ): GameStateMutationResult {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { ok: false, error: 'Session not found.' };
    }
    const writer = state.players.find((player) => player.id === actorId);
    if (!writer) {
      return { ok: false, error: 'Player not found.' };
    }
    state.whiteboard = state.whiteboard.map((line, index) => {
      const text = lines[index] ?? null;
      if (text === null || text === line.text) {
        return line;
      }
      return text
        ? { text, authorId: writer.id, color: writer.color }
        : { text: '', authorId: null, color: null };
    });
    return { ok: true, state };
  }

  /** Not host-gated — toggling the room light affects every player equally,
   * no per-player authority question to gate (Milestone 8). */
  toggleLight(sessionId: string): GameStateMutationResult {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { ok: false, error: 'Session not found.' };
    }
    state.lightOn = !state.lightOn;
    return { ok: true, state };
  }

  /** Not host-gated — a player can only ever toggle their *own* seated
   * status (`playerId` always comes from the requester, never a target),
   * so there's no way to sit another player down (Milestone 8). */
  toggleSeated(sessionId: string, playerId: string): GameStateMutationResult {
    const player = this.sessions
      .get(sessionId)
      ?.players.find((candidate) => candidate.id === playerId);
    return this.setSeated(sessionId, playerId, !player?.seated);
  }

  /** Sits a player down (on `seatIndex`, if given and free) or stands them
   * up. Only ever changes the requesting player's own record. */
  setSeated(
    sessionId: string,
    playerId: string,
    seated: boolean,
    seatIndex?: number,
  ): GameStateMutationResult {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { ok: false, error: 'Session not found.' };
    }
    const player = state.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      return { ok: false, error: 'Player not found.' };
    }
    if (!seated) {
      player.seated = false;
      player.seatIndex = null;
      return { ok: true, state };
    }
    if (
      seatIndex !== undefined &&
      state.players.some(
        (other) => other.id !== playerId && other.seated && other.seatIndex === seatIndex,
      )
    ) {
      return { ok: false, error: 'Someone just took that chair — try again.' };
    }
    player.seated = true;
    player.seatIndex = seatIndex ?? null;
    return { ok: true, state };
  }

  /** Starts a soundboard entry as the shared clip, if it's a YouTube link
   * (clip.ts). Returns the new state, or null for any other sound. */
  startClip(sessionId: string, playerId: string, soundId: string): GameState | null {
    const state = this.sessions.get(sessionId);
    const sound = state?.soundboard.find((candidate) => candidate.id === soundId);
    const youtube = sound ? parseYouTubeUrl(sound.url) : null;
    if (!state || !sound || !youtube) {
      return null;
    }
    state.clip = {
      id: randomUUID(),
      soundId,
      videoId: youtube.videoId,
      title: sound.name,
      playedBy: state.players.find((player) => player.id === playerId)?.name ?? 'someone',
      playing: true,
      position: youtube.startSeconds,
      anchorAt: Date.now(),
    };
    return state;
  }

  /** Pause/play/seek/stop the shared clip, or mark it ended. While the host
   * has locked it, only the host may — except `ended`, which isn't a
   * choice anyone made. A control for an older clip changes nothing. */
  controlClip(
    sessionId: string,
    actorId: string,
    clipId: string,
    action: ClipAction,
    position: number,
    now = Date.now(),
  ): GameStateMutationResult {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { ok: false, error: 'Session not found.' };
    }
    const clip = state.clip;
    if (!clip || clip.id !== clipId) {
      return { ok: false, error: 'That clip has already finished.' };
    }
    if (state.clipLocked && action !== 'ended' && state.hostId !== actorId) {
      return { ok: false, error: CLIP_LOCKED_ERROR };
    }
    if (action === 'stop' || action === 'ended') {
      state.clip = null;
      return { ok: true, state };
    }
    clip.position = position;
    clip.anchorAt = now;
    if (action === 'play') clip.playing = true;
    if (action === 'pause') clip.playing = false;
    return { ok: true, state };
  }

  /** Host only: lock (or unlock) the shared clip's controls. */
  setClipLocked(sessionId: string, actorId: string, locked: boolean): GameStateMutationResult {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { ok: false, error: 'Session not found.' };
    }
    if (state.hostId !== actorId) {
      return { ok: false, error: 'Only the host can lock the TV.' };
    }
    state.clipLocked = locked;
    return { ok: true, state };
  }

  /** The host's own controls (host.ts): the table as the host may change
   * it, or why not. */
  private asHost(
    sessionId: string,
    actorId: string,
  ): { ok: true; state: GameState; host: Player } | { ok: false; error: string } {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { ok: false, error: 'Session not found.' };
    }
    const host = state.players.find((player) => player.id === actorId);
    if (!host || state.hostId !== actorId) {
      return { ok: false, error: HOST_ONLY_ERROR };
    }
    return { ok: true, state, host };
  }

  /** Host only: lock the table to newcomers, or open it again. */
  setLocked(sessionId: string, actorId: string, locked: boolean): GameStateMutationResult {
    const table = this.asHost(sessionId, actorId);
    if (!table.ok) return table;
    const { state, host } = table;
    if (state.locked !== locked) {
      state.locked = locked;
      addSystemEntry(state, `${host.name} ${locked ? 'locked' : 'unlocked'} the table`);
    }
    return { ok: true, state };
  }

  /** Host only: what everyone else may do (the host always may). */
  setPermission(
    sessionId: string,
    actorId: string,
    permission: TablePermission,
    allowed: boolean,
  ): GameStateMutationResult {
    const table = this.asHost(sessionId, actorId);
    if (!table.ok) return table;
    const { state, host } = table;
    if (state.permissions[permission] !== allowed) {
      state.permissions = { ...state.permissions, [permission]: allowed };
      const what = permission === 'draw' ? 'draw on the map' : 'use sounds';
      addSystemEntry(
        state,
        allowed ? `${host.name} let everyone ${what} again` : `Only ${host.name} can ${what} now`,
      );
    }
    return { ok: true, state };
  }

  /** Host only: dress the room (and the night outside) for an occasion. */
  setTheme(sessionId: string, actorId: string, theme: RoomTheme): GameStateMutationResult {
    const table = this.asHost(sessionId, actorId);
    if (!table.ok) return table;
    const { state, host } = table;
    if (state.theme !== theme) {
      addSystemEntry(
        state,
        theme === 'halloween'
          ? `${host.name} dressed the room for Halloween`
          : state.theme === 'halloween'
            ? `${host.name} took the Halloween decorations down`
            : `${host.name} changed the room`,
      );
      state.theme = theme;
    }
    return { ok: true, state };
  }

  /** Host only: remove another player from the table. They're kept out
   * for as long as the table runs. */
  removePlayer(
    sessionId: string,
    actorId: string,
    targetPlayerId: string,
  ): GameStateMutationResult {
    const table = this.asHost(sessionId, actorId);
    if (!table.ok) return table;
    if (targetPlayerId === actorId) {
      return { ok: false, error: 'You can’t remove yourself — leave the table instead.' };
    }
    if (!table.state.players.some((player) => player.id === targetPlayerId)) {
      return { ok: false, error: 'Player not found.' };
    }
    let removed = this.removedPlayers.get(sessionId);
    if (!removed) {
      removed = new Set();
      this.removedPlayers.set(sessionId, removed);
    }
    removed.add(targetPlayerId);
    // The host stays, so the table does too.
    const state = this.leave(sessionId, targetPlayerId, `was removed by ${table.host.name}`)!;
    return { ok: true, state };
  }

  /** Host only: sweep something off the table (host.ts, `ClearTarget`). */
  clearTable(sessionId: string, actorId: string, target: ClearTarget): GameStateMutationResult {
    const table = this.asHost(sessionId, actorId);
    if (!table.ok) return table;
    const { state, host } = table;
    let what: string | null = null;
    if (target === 'drawings') {
      const scene = state.scenes.find((candidate) => candidate.id === state.activeSceneId);
      if (scene && scene.drawings.length > 0) {
        scene.drawings = [];
        what = 'cleared the drawings off the map';
      }
    } else if (target === 'whiteboard') {
      if (state.whiteboard.some((line) => line.text)) {
        state.whiteboard = emptyWhiteboard();
        what = 'wiped the whiteboard';
      }
    } else if (target === 'dice') {
      if (state.dice.length > 0) {
        state.dice = [];
        what = 'took all the dice off the table';
      }
    } else if (Object.keys(state.minis).length > 0) {
      state.minis = {};
      what = 'took all the minis off the table';
    }
    if (what) {
      addSystemEntry(state, `${host.name} ${what}`);
    }
    return { ok: true, state };
  }

  /** Put a mini on the table, move it, or take it off (`point: null`).
   * Your own; the host may move anyone's (minis.ts). */
  moveMini(
    sessionId: string,
    actorId: string,
    targetPlayerId: string,
    point: Point2D | null,
  ): GameStateMutationResult {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { ok: false, error: 'Session not found.' };
    }
    if (actorId !== targetPlayerId && state.hostId !== actorId) {
      return { ok: false, error: "Only the host can move someone else's mini." };
    }
    if (!state.players.some((player) => player.id === targetPlayerId)) {
      return { ok: false, error: 'Player not found.' };
    }
    if (point) {
      state.minis[targetPlayerId] = clampToTable(point);
    } else {
      delete state.minis[targetPlayerId];
    }
    return { ok: true, state };
  }

  /** Drag a die somewhere else on the table: your own; the host may move
   * any. The client knows the table's shape — the position is only
   * sanity-checked here. */
  moveDie(
    sessionId: string,
    actorId: string,
    diceId: string,
    position: Vector3,
  ): GameStateMutationResult {
    const state = this.sessions.get(sessionId);
    const die = state?.dice.find((candidate) => candidate.id === diceId);
    if (!state || !die) {
      return { ok: false, error: 'Die not found.' };
    }
    if (die.ownerId !== actorId && state.hostId !== actorId) {
      return { ok: false, error: "Only the host can move someone else's die." };
    }
    die.position = { ...position };
    return { ok: true, state };
  }

  hasSound(sessionId: string, soundId: string): boolean {
    return this.sessions.get(sessionId)?.soundboard.some((sound) => sound.id === soundId) ?? false;
  }

  /** Not host-gated — any player can contribute a sound to the shared
   * soundboard (the file-uploads extension). `url` is the already-uploaded file's address
   * (see server.ts's /uploads/sounds REST route and client/src/uploads.ts)
   * — this just registers it into the session, the same "upload over REST,
   * register over the socket" split `scene:update`'s map background uses.
   * `slotIndex`, when given, also assigns the new sound to that wall-board
   * slot in the same mutation (pressing an empty button, Milestone 8
   * follow-up) — validated as in-range by `validation.ts` before this is
   * ever called, but bounds-checked again here defensively since this method
   * also has non-socket callers in tests. */
  addSound(
    sessionId: string,
    soundId: string,
    name: string,
    url: string,
    slotIndex?: number,
    addedBy: string | null = null,
  ): GameStateMutationResult {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { ok: false, error: 'Session not found.' };
    }
    if (state.soundboard.some((sound) => sound.id === soundId)) {
      return { ok: false, error: 'A sound with that id already exists.' };
    }

    state.soundboard.push({ id: soundId, name, url, playing: false, addedBy });
    if (slotIndex !== undefined && slotIndex >= 0 && slotIndex < state.soundboardSlots.length) {
      state.soundboardSlots[slotIndex] = soundId;
    }
    return { ok: true, state };
  }

  /** Any player: put an existing sound on a wall button, or clear it (null). */
  assignSoundboardSlot(
    sessionId: string,
    slotIndex: number,
    soundId: string | null,
  ): GameStateMutationResult {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { ok: false, error: 'Session not found.' };
    }
    if (slotIndex < 0 || slotIndex >= state.soundboardSlots.length) {
      return { ok: false, error: 'No such button.' };
    }
    if (soundId !== null && !state.soundboard.some((sound) => sound.id === soundId)) {
      return { ok: false, error: 'Sound not found.' };
    }
    state.soundboardSlots[slotIndex] = soundId;
    return { ok: true, state };
  }

  /** Whoever added a sound, or the host, can remove it — from the list and
   * from every wall button showing it. */
  removeSound(sessionId: string, actorId: string, soundId: string): GameStateMutationResult {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { ok: false, error: 'Session not found.' };
    }
    const sound = state.soundboard.find((candidate) => candidate.id === soundId);
    if (!sound) {
      return { ok: false, error: 'Sound not found.' };
    }
    if (sound.addedBy !== actorId && state.hostId !== actorId) {
      return { ok: false, error: 'Only whoever added a sound, or the host, can remove it.' };
    }
    state.soundboard = state.soundboard.filter((candidate) => candidate.id !== soundId);
    state.soundboardSlots = state.soundboardSlots.map((slot) => (slot === soundId ? null : slot));
    return { ok: true, state };
  }
}

/**
 * A saved table's state, made safe to play: anything a save from an older
 * version lacks gets today's default, and every player starts out away
 * (they reconnect, or are removed after the grace period like any drop).
 */
function normalizeRestoredState(sessionId: string, saved: GameState): GameState {
  const base = createEmptySession(sessionId, saved.hostId ?? '');
  const state: GameState = { ...base, ...saved, sessionId };
  const defaultScene = createDefaultScene();
  state.scenes = (saved.scenes?.length ? saved.scenes : base.scenes).map((scene) => ({
    ...defaultScene,
    ...scene,
  }));
  if (!state.scenes.some((scene) => scene.id === state.activeSceneId)) {
    state.activeSceneId = state.scenes[0]!.id;
  }
  state.players = (saved.players ?? []).map((player) => ({ ...player, connected: false }));
  state.permissions = { ...base.permissions, ...saved.permissions };
  const slots = saved.soundboardSlots ?? base.soundboardSlots;
  state.soundboardSlots = Array.from({ length: SOUNDBOARD_SLOT_COUNT }, (_, i) => slots[i] ?? null);
  return state;
}

function createEmptySession(sessionId: string, hostId: string): GameState {
  return {
    sessionId,
    hostId,
    activeSceneId: DEFAULT_SCENE_ID,
    scenes: [createDefaultScene()],
    players: [],
    dice: [],
    // A fresh copy per session — never the shared BUILTIN_SOUND_PRESETS
    // array/objects themselves, so per-session mutation (a future rename,
    // say) can't leak across sessions.
    soundboard: BUILTIN_SOUND_PRESETS.map((preset) => ({ ...preset })),
    // The wall board starts with the built-in presets filling its first few
    // buttons (continuity with the old console, which always showed them)
    // and every other slot empty, ready for a player to press and attach
    // something via the assign menu.
    soundboardSlots: [
      ...BUILTIN_SOUND_PRESETS.map((preset) => preset.id),
      ...Array<null>(SOUNDBOARD_SLOT_COUNT - BUILTIN_SOUND_PRESETS.length).fill(null),
    ],
    lightOn: true,
    whiteboard: emptyWhiteboard(),
    log: [],
    clip: null,
    clipLocked: false,
    minis: {},
    locked: false,
    permissions: { ...DEFAULT_PERMISSIONS },
    theme: 'classic',
  };
}

function authorOf(player: Player): { playerId: string; name: string; color: PlayerColorId } {
  return { playerId: player.id, name: player.name, color: player.color };
}

function addSystemEntry(state: GameState, text: string): void {
  state.log = appendLogEntry(state.log, { ...stamp(), kind: 'system', text });
}

/** Every session starts with one scene, auto-created the same way the
 * session itself is (implicitly, on first join) — mirrors the M2 "implicit
 * session creation" pattern so the host can set a background image or a
 * player can draw immediately, without a separate "create your first scene"
 * step. `scene:create` still exists for adding further scenes (Milestone 5
 * scope note in docs/decisions.md: implemented and tested, not yet wired to
 * a multi-scene UI). */
function createDefaultScene(): Scene {
  return { id: DEFAULT_SCENE_ID, name: 'Map', backgroundImage: '', gridCells: 0, drawings: [] };
}

/** The preferred color if nobody in the session wears it yet, otherwise the
 * first free one in PLAYER_COLORS order — or null if all six are taken. */
function pickColor(state: GameState, preferred?: PlayerColorId): PlayerColorId | null {
  const taken = new Set(state.players.map((player) => player.color));
  if (preferred && !taken.has(preferred)) {
    return preferred;
  }
  return PLAYER_COLORS.find((color) => !taken.has(color.id))?.id ?? null;
}

function createPlayer(id: string, name: string, color: PlayerColorId): Player {
  // Each color has its own spot facing the table, so players who just
  // joined don't stand inside each other; the client starts its camera here
  // and live player:move updates take over from there.
  const spawn = spawnPointFor(color);
  return {
    id,
    name,
    color,
    character: { id, name }, // character customization isn't scoped yet; the player stands in for their own character for now
    position: spawn.position,
    rotationY: spawn.rotationY,
    muted: false,
    seated: false,
    seatIndex: null,
    connected: true,
  };
}
