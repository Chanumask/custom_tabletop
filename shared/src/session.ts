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
}

export type SessionJoinResponse = { ok: true; state: GameState } | { ok: false; error: string };

export interface SessionLeaveRequest {
  sessionId: string;
  playerId: string;
}

export type SessionLeaveResponse = { ok: true } | { ok: false; error: string };
