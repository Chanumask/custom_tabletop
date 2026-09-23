import type { SessionJoinRequest, SessionLeaveRequest } from '@custom-tabletop/shared';

/**
 * Runtime guards for socket payloads. TypeScript's types don't survive to
 * runtime, and a client is never trusted to send well-formed data (per
 * docs/engineering/architecture.md's "Autorität und Synchronisierung") — a
 * malformed or malicious payload must be rejected here, not crash a handler.
 */

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function parseSessionJoinRequest(payload: unknown): SessionJoinRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, playerName } = payload as Record<string, unknown>;
  if (
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(playerId) ||
    !isNonEmptyString(playerName)
  ) {
    return null;
  }

  return { sessionId: sessionId.trim(), playerId: playerId.trim(), playerName: playerName.trim() };
}

export function parseSessionLeaveRequest(payload: unknown): SessionLeaveRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId } = payload as Record<string, unknown>;
  if (!isNonEmptyString(sessionId) || !isNonEmptyString(playerId)) {
    return null;
  }

  return { sessionId: sessionId.trim(), playerId: playerId.trim() };
}
