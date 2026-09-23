import {
  DEFAULT_SPAWN_POSITION,
  type GameState,
  type Player,
  type Vector3,
} from '@custom-tabletop/shared';

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
}

function createEmptySession(sessionId: string, hostId: string): GameState {
  return {
    sessionId,
    hostId,
    activeSceneId: '', // no scenes until Milestone 5
    scenes: [],
    players: [],
    drawings: [],
    dice: [],
    soundboard: [],
  };
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
