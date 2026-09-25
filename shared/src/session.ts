/**
 * Request/response payload shapes for the session:* events. The original
 * spec (docs/engineering/architecture.md) named the events but not their
 * payloads — these were designed in Milestone 2, layered on top of the
 * domain types in types.ts.
 */
import type { GameState } from './types.js';
import type { PlayerColorId } from './player.js';

export interface SessionJoinRequest {
  sessionId: string;
  playerId: string;
  playerName: string;
  /** A per-tab secret generated alongside `playerId` and never broadcast.
   * `playerId` itself is public (every client sees it in GameState), so
   * rejoining as an existing player — the reconnect path — has to prove
   * it's the same tab that originally joined, not someone who read the id
   * off a broadcast (docs/decisions.md, identity binding). */
  playerToken: string;
  /** An automatic rejoin (page reload, dropped connection) rather than a
   * player deliberately joining/hosting: only succeeds if the session still
   * exists, failing with `SESSION_ENDED_ERROR` otherwise. Without this, an
   * auto-rejoin after the session is gone (e.g. a server restart wiped the
   * in-memory state) would silently create a brand-new empty session with
   * this player as host. */
  resume?: boolean;
  /** The table's host key, if this browser has one (from hosting it before,
   * or from a host link). Reopening a saved table — one everyone has left —
   * needs it; for a live table it's ignored. */
  hostKey?: string;
  /** The color picked on the join screen. Honored if still free in the
   * session; otherwise the first free color is assigned (the join screen
   * greys out taken ones via `session:peek`, so this only matters in a
   * race). Ignored on a rejoin — a returning player keeps their color. */
  color?: PlayerColorId;
}

export type SessionJoinResponse =
  | {
      ok: true;
      state: GameState;
      /** Only when the joiner is the host: the table's host key, to keep
       * (it reopens the table later, and makes the host link). */
      hostKey?: string;
      /** The server's clock (epoch ms) when it answered — the client's
       * offset to it keeps a shared clip in step (clip.ts). */
      serverNow: number;
    }
  | { ok: false; error: string };

/** `session:host-key` payload: sent privately to whoever becomes host. */
export interface SessionHostKey {
  sessionId: string;
  hostKey: string;
}

/** How long a table everyone has left is kept, reopenable by its host. */
export const SAVED_TABLE_TTL_DAYS = 7;

/** The `session:join` rejection for a saved table without its host key. */
export const TABLE_WAITING_FOR_HOST_ERROR =
  'This table is saved and waiting for its host — join once they’ve reopened it.';

/** Session codes longer than this are refused (the client makes 5, allows 12). */
export const MAX_SESSION_ID_LENGTH = 32;

/** The `session:join` rejection for a `resume` join whose session no longer
 * exists — a stable string so the client can recognize it. */
export const SESSION_ENDED_ERROR = 'That session has ended.';

export interface SessionLeaveRequest {
  sessionId: string;
  playerId: string;
}

export type SessionLeaveResponse = { ok: true } | { ok: false; error: string };

/** session:peek — a look at a session *before* joining it, for the join
 * screen: whether it exists, who's there, and which colors are taken. */
export interface SessionPeekRequest {
  sessionId: string;
}

export interface SessionPeekResponse {
  exists: boolean;
  playerCount: number;
  hostName: string | null;
  takenColors: PlayerColorId[];
  /** A saved table nobody is at right now — only its host can reopen it.
   * `hostName` is then whoever hosted it last. */
  saved?: boolean;
  /** For a saved table: when it was last played (epoch ms). */
  lastActiveAt?: number;
}

/** Host-only: hands the host role to another player in the session. */
export interface SessionTransferHostRequest {
  sessionId: string;
  playerId: string;
  targetPlayerId: string;
}

export type SessionTransferHostResponse =
  { ok: true; state: GameState } | { ok: false; error: string };
