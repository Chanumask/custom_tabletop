import type {
  SessionJoinRequest,
  SessionLeaveRequest,
  PlayerMoveRequest,
  SceneCreateRequest,
  SceneChangeRequest,
  SceneUpdateRequest,
  DrawingStartRequest,
  DrawingUpdateRequest,
  DrawingEndRequest,
  DrawingDeleteRequest,
  DiceSpawnRequest,
  DiceRollRequest,
  DiceRemoveRequest,
  SoundPlayRequest,
  SoundUploadRequest,
  PlayerMuteRequest,
  PlayerUnmuteRequest,
  Vector3,
  Point2D,
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

function isPoint2D(value: unknown): value is Point2D {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { x, y } = value as Record<string, unknown>;
  return isFiniteNumber(x) && isFiniteNumber(y);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
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

export function parseSceneCreateRequest(payload: unknown): SceneCreateRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, sceneId, name, backgroundImage } = payload as Record<
    string,
    unknown
  >;
  if (
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(playerId) ||
    !isNonEmptyString(sceneId) ||
    !isNonEmptyString(name) ||
    typeof backgroundImage !== 'string'
  ) {
    return null;
  }

  return {
    sessionId: sessionId.trim(),
    playerId: playerId.trim(),
    sceneId: sceneId.trim(),
    name: name.trim(),
    backgroundImage,
  };
}

export function parseSceneChangeRequest(payload: unknown): SceneChangeRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, sceneId } = payload as Record<string, unknown>;
  if (!isNonEmptyString(sessionId) || !isNonEmptyString(playerId) || !isNonEmptyString(sceneId)) {
    return null;
  }

  return { sessionId: sessionId.trim(), playerId: playerId.trim(), sceneId: sceneId.trim() };
}

export function parseSceneUpdateRequest(payload: unknown): SceneUpdateRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, sceneId, name, backgroundImage } = payload as Record<
    string,
    unknown
  >;
  if (
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(playerId) ||
    !isNonEmptyString(sceneId) ||
    !isOptionalString(name) ||
    !isOptionalString(backgroundImage)
  ) {
    return null;
  }
  if (name === undefined && backgroundImage === undefined) {
    return null; // nothing to update
  }

  return {
    sessionId: sessionId.trim(),
    playerId: playerId.trim(),
    sceneId: sceneId.trim(),
    name,
    backgroundImage,
  };
}

export function parseDrawingStartRequest(payload: unknown): DrawingStartRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, sceneId, drawingId, point } = payload as Record<string, unknown>;
  if (
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(playerId) ||
    !isNonEmptyString(sceneId) ||
    !isNonEmptyString(drawingId) ||
    !isPoint2D(point)
  ) {
    return null;
  }

  return {
    sessionId: sessionId.trim(),
    playerId: playerId.trim(),
    sceneId: sceneId.trim(),
    drawingId: drawingId.trim(),
    point,
  };
}

export function parseDrawingUpdateRequest(payload: unknown): DrawingUpdateRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, drawingId, point } = payload as Record<string, unknown>;
  if (!isNonEmptyString(sessionId) || !isNonEmptyString(drawingId) || !isPoint2D(point)) {
    return null;
  }

  return { sessionId: sessionId.trim(), drawingId: drawingId.trim(), point };
}

export function parseDrawingEndRequest(payload: unknown): DrawingEndRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, drawingId } = payload as Record<string, unknown>;
  if (!isNonEmptyString(sessionId) || !isNonEmptyString(drawingId)) {
    return null;
  }

  return { sessionId: sessionId.trim(), drawingId: drawingId.trim() };
}

export function parseDrawingDeleteRequest(payload: unknown): DrawingDeleteRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, sceneId, drawingId } = payload as Record<string, unknown>;
  if (!isNonEmptyString(sessionId) || !isNonEmptyString(sceneId) || !isNonEmptyString(drawingId)) {
    return null;
  }

  return { sessionId: sessionId.trim(), sceneId: sceneId.trim(), drawingId: drawingId.trim() };
}

export function parseDiceSpawnRequest(payload: unknown): DiceSpawnRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, diceId, position } = payload as Record<string, unknown>;
  if (
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(playerId) ||
    !isNonEmptyString(diceId) ||
    !isVector3(position)
  ) {
    return null;
  }

  return {
    sessionId: sessionId.trim(),
    playerId: playerId.trim(),
    diceId: diceId.trim(),
    position,
  };
}

export function parseDiceRollRequest(payload: unknown): DiceRollRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, diceId } = payload as Record<string, unknown>;
  if (!isNonEmptyString(sessionId) || !isNonEmptyString(playerId) || !isNonEmptyString(diceId)) {
    return null;
  }

  return { sessionId: sessionId.trim(), playerId: playerId.trim(), diceId: diceId.trim() };
}

export function parseDiceRemoveRequest(payload: unknown): DiceRemoveRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, diceId } = payload as Record<string, unknown>;
  if (!isNonEmptyString(sessionId) || !isNonEmptyString(playerId) || !isNonEmptyString(diceId)) {
    return null;
  }

  return { sessionId: sessionId.trim(), playerId: playerId.trim(), diceId: diceId.trim() };
}

export function parseSoundPlayRequest(payload: unknown): SoundPlayRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, soundId } = payload as Record<string, unknown>;
  if (!isNonEmptyString(sessionId) || !isNonEmptyString(playerId) || !isNonEmptyString(soundId)) {
    return null;
  }

  return { sessionId: sessionId.trim(), playerId: playerId.trim(), soundId: soundId.trim() };
}

export function parseSoundUploadRequest(payload: unknown): SoundUploadRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, soundId, name, url } = payload as Record<string, unknown>;
  if (
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(playerId) ||
    !isNonEmptyString(soundId) ||
    !isNonEmptyString(name) ||
    !isNonEmptyString(url)
  ) {
    return null;
  }

  return {
    sessionId: sessionId.trim(),
    playerId: playerId.trim(),
    soundId: soundId.trim(),
    name: name.trim(),
    url: url.trim(),
  };
}

export function parsePlayerMuteRequest(payload: unknown): PlayerMuteRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, targetPlayerId } = payload as Record<string, unknown>;
  if (
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(playerId) ||
    !isNonEmptyString(targetPlayerId)
  ) {
    return null;
  }

  return {
    sessionId: sessionId.trim(),
    playerId: playerId.trim(),
    targetPlayerId: targetPlayerId.trim(),
  };
}

export function parsePlayerUnmuteRequest(payload: unknown): PlayerUnmuteRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, targetPlayerId } = payload as Record<string, unknown>;
  if (
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(playerId) ||
    !isNonEmptyString(targetPlayerId)
  ) {
    return null;
  }

  return {
    sessionId: sessionId.trim(),
    playerId: playerId.trim(),
    targetPlayerId: targetPlayerId.trim(),
  };
}
