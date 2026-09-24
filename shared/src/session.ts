/**
 * Request/response payload shapes for the session:* events. The original
 * spec (docs/engineering/architecture.md) named the events but not their
 * payloads — these were designed in Milestone 2, layered on top of the
 * domain types in types.ts.
 */
import type { GameState } from './types.js';

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
}

export type SessionJoinResponse = { ok: true; state: GameState } | { ok: false; error: string };

/** The `session:join` rejection for a `resume` join whose session no longer
 * exists — a stable string so the client can recognize it. */
export const SESSION_ENDED_ERROR = 'That session has ended.';

export interface SessionLeaveRequest {
  sessionId: string;
  playerId: string;
}

export type SessionLeaveResponse = { ok: true } | { ok: false; error: string };

/** Host-only: hands the host role to another player in the session. */
export interface SessionTransferHostRequest {
  sessionId: string;
  playerId: string;
  targetPlayerId: string;
}

export type SessionTransferHostResponse =
  { ok: true; state: GameState } | { ok: false; error: string };
