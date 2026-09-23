import type {
  SessionJoinRequest,
  SessionLeaveRequest,
  PlayerMoveRequest,
  Vector3,
} from '@custom-tabletop/shared';

/**
 * Runtime guards for socket payloads. TypeScript's types don't survive to
 * runtime, and a client is never trusted to send well-formed data (per
 * docs/engineering/architecture.md's "Autorität und Synchronisierung") — a
 * malformed or malicious payload must be rejected here, not crash a handler.
 */

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isVector3(value: unknown): value is Vector3 {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { x, y, z } = value as Record<string, unknown>;
  return isFiniteNumber(x) && isFiniteNumber(y) && isFiniteNumber(z);
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

export function parsePlayerMoveRequest(payload: unknown): PlayerMoveRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, position, rotationY } = payload as Record<string, unknown>;
  if (
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(playerId) ||
    !isVector3(position) ||
    !isFiniteNumber(rotationY)
  ) {
    return null;
  }

  return { sessionId: sessionId.trim(), playerId: playerId.trim(), position, rotationY };
}
