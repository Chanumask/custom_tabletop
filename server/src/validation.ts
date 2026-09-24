import {
  MAX_DICE_PER_ROLL,
  MAX_PLAYER_NAME_LENGTH,
  isDieKind,
  MAX_SOUND_NAME_LENGTH,
  SOUNDBOARD_SLOT_COUNT,
  WHITEBOARD_LINE_COUNT,
  WHITEBOARD_MAX_LINE_LENGTH,
  isEmoteId,
  type WhiteboardWriteRequest,
  isHttpUrl,
  isPlayerColorId,
  type PlayerEmoteRequest,
  type SoundboardAssignRequest,
  type SoundRemoveRequest,
  type PlayerUpdateRequest,
  type SessionJoinRequest,
  type SessionLeaveRequest,
  type SessionPeekRequest,
  type SessionTransferHostRequest,
  type PlayerMoveRequest,
  type SceneCreateRequest,
  type SceneChangeRequest,
  type SceneUpdateRequest,
  type DrawingStartRequest,
  type DrawingUpdateRequest,
  type DrawingEndRequest,
  type DrawingDeleteRequest,
  type DiceSpawnRequest,
  type DiceRollRequest,
  type DiceRemoveRequest,
  type SoundPlayRequest,
  type SoundUploadRequest,
  type PlayerMuteRequest,
  type PlayerUnmuteRequest,
  type ObjectInteractRequest,
  type Vector3,
  type Point2D,
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

function isOptionalSlotIndex(value: unknown): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= 0 &&
      value < SOUNDBOARD_SLOT_COUNT)
  );
}

// A generous cap — a real token is a UUID — so a malicious payload can't
// park an arbitrarily large string in server memory.
const MAX_TOKEN_LENGTH = 200;

export function parseSessionJoinRequest(payload: unknown): SessionJoinRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, playerName, playerToken, resume, color } = payload as Record<
    string,
    unknown
  >;
  if (
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(playerId) ||
    !isPlayerName(playerName) ||
    !isNonEmptyString(playerToken) ||
    playerToken.length > MAX_TOKEN_LENGTH ||
    (resume !== undefined && typeof resume !== 'boolean') ||
    (color !== undefined && !isPlayerColorId(color))
  ) {
    return null;
  }

  return {
    sessionId: sessionId.trim(),
    playerId: playerId.trim(),
    playerName: playerName.trim(),
    playerToken,
    ...(resume === undefined ? {} : { resume }),
    ...(color === undefined ? {} : { color }),
  };
}

function isPlayerName(value: unknown): value is string {
  return isNonEmptyString(value) && value.trim().length <= MAX_PLAYER_NAME_LENGTH;
}

export function parseSessionPeekRequest(payload: unknown): SessionPeekRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const { sessionId } = payload as Record<string, unknown>;
  return isNonEmptyString(sessionId) ? { sessionId: sessionId.trim() } : null;
}

export function parsePlayerUpdateRequest(payload: unknown): PlayerUpdateRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, name, color } = payload as Record<string, unknown>;
  if (
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(playerId) ||
    (name !== undefined && !isPlayerName(name)) ||
    (color !== undefined && !isPlayerColorId(color)) ||
    (name === undefined && color === undefined)
  ) {
    return null;
  }

  return {
    sessionId: sessionId.trim(),
    playerId: playerId.trim(),
    ...(name === undefined ? {} : { name: name.trim() }),
    ...(color === undefined ? {} : { color }),
  };
}

export function parseSessionTransferHostRequest(
  payload: unknown,
): SessionTransferHostRequest | null {
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

// Sanity bounds on a client-supplied stroke width — wide enough for the
// toolbar's own thin/medium/thick presets with headroom, narrow enough that
// a malformed/malicious value can't paint an absurdly huge line.
const MIN_STROKE_WIDTH = 1;
const MAX_STROKE_WIDTH = 40;

function isValidStrokeWidth(value: unknown): value is number {
  return isFiniteNumber(value) && value >= MIN_STROKE_WIDTH && value <= MAX_STROKE_WIDTH;
}

export function parseDrawingStartRequest(payload: unknown): DrawingStartRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, sceneId, drawingId, point, color, width } = payload as Record<
    string,
    unknown
  >;
  if (
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(playerId) ||
    !isNonEmptyString(sceneId) ||
    !isNonEmptyString(drawingId) ||
    !isPoint2D(point) ||
    !isNonEmptyString(color) ||
    !isValidStrokeWidth(width)
  ) {
    return null;
  }

  return {
    sessionId: sessionId.trim(),
    playerId: playerId.trim(),
    sceneId: sceneId.trim(),
    drawingId: drawingId.trim(),
    point,
    color: color.trim(),
    width,
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

  const { sessionId, playerId, diceId, position, kind } = payload as Record<string, unknown>;
  if (
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(playerId) ||
    !isNonEmptyString(diceId) ||
    !isVector3(position) ||
    (kind !== undefined && !isDieKind(kind))
  ) {
    return null;
  }

  return {
    sessionId: sessionId.trim(),
    playerId: playerId.trim(),
    diceId: diceId.trim(),
    position,
    kind: kind ?? 'd6',
  };
}

export function parseDiceRollRequest(payload: unknown): DiceRollRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, diceIds } = payload as Record<string, unknown>;
  if (
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(playerId) ||
    !Array.isArray(diceIds) ||
    diceIds.length === 0 ||
    diceIds.length > MAX_DICE_PER_ROLL ||
    !diceIds.every(isNonEmptyString)
  ) {
    return null;
  }

  return {
    sessionId: sessionId.trim(),
    playerId: playerId.trim(),
    diceIds: (diceIds as string[]).map((id) => id.trim()),
  };
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

  const { sessionId, playerId, soundId, name, url, slotIndex } = payload as Record<string, unknown>;
  if (
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(playerId) ||
    !isNonEmptyString(soundId) ||
    !isNonEmptyString(name) ||
    !isNonEmptyString(url) ||
    url.length > MAX_URL_LENGTH ||
    !isHttpUrl(url.trim()) ||
    !isOptionalSlotIndex(slotIndex)
  ) {
    return null;
  }

  return {
    sessionId: sessionId.trim(),
    playerId: playerId.trim(),
    soundId: soundId.trim(),
    // Long file names/titles are shortened rather than refused — the name
    // is a label, not an identifier.
    name: name.trim().slice(0, MAX_SOUND_NAME_LENGTH),
    url: url.trim(),
    slotIndex,
  };
}

const MAX_URL_LENGTH = 2048;

export function parseSoundboardAssignRequest(payload: unknown): SoundboardAssignRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, slotIndex, soundId } = payload as Record<string, unknown>;
  if (
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(playerId) ||
    slotIndex === undefined ||
    !isOptionalSlotIndex(slotIndex) ||
    (soundId !== null && !isNonEmptyString(soundId))
  ) {
    return null;
  }

  return {
    sessionId: sessionId.trim(),
    playerId: playerId.trim(),
    slotIndex,
    soundId: soundId === null ? null : soundId.trim(),
  };
}

export function parseSoundRemoveRequest(payload: unknown): SoundRemoveRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, soundId } = payload as Record<string, unknown>;
  if (!isNonEmptyString(sessionId) || !isNonEmptyString(playerId) || !isNonEmptyString(soundId)) {
    return null;
  }

  return { sessionId: sessionId.trim(), playerId: playerId.trim(), soundId: soundId.trim() };
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

export function parseObjectInteractRequest(payload: unknown): ObjectInteractRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, objectId } = payload as Record<string, unknown>;
  if (!isNonEmptyString(sessionId) || !isNonEmptyString(playerId) || !isNonEmptyString(objectId)) {
    return null;
  }

  return { sessionId: sessionId.trim(), playerId: playerId.trim(), objectId: objectId.trim() };
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

export function parsePlayerEmoteRequest(payload: unknown): PlayerEmoteRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, emote } = payload as Record<string, unknown>;
  if (!isNonEmptyString(sessionId) || !isNonEmptyString(playerId) || !isEmoteId(emote)) {
    return null;
  }

  return { sessionId: sessionId.trim(), playerId: playerId.trim(), emote };
}

// Control characters (newlines, tabs, ...) would break the board's one-line-
// per-row layout, so they're turned into spaces rather than rejected.
/** Replaces control characters (code points below 32, and 127) with spaces. */
function withoutControlChars(text: string): string {
  let result = '';
  for (const char of text) {
    const code = char.charCodeAt(0);
    result += code < 32 || code === 127 ? ' ' : char;
  }
  return result;
}

export function parseWhiteboardWriteRequest(payload: unknown): WhiteboardWriteRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, lines } = payload as Record<string, unknown>;
  if (
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(playerId) ||
    !Array.isArray(lines) ||
    lines.length !== WHITEBOARD_LINE_COUNT ||
    !lines.every((line) => line === null || typeof line === 'string')
  ) {
    return null;
  }
  const cleaned = (lines as (string | null)[]).map((line) =>
    line === null ? null : withoutControlChars(line).trimEnd(),
  );
  if (cleaned.some((line) => line !== null && line.length > WHITEBOARD_MAX_LINE_LENGTH)) {
    return null;
  }

  return { sessionId: sessionId.trim(), playerId: playerId.trim(), lines: cleaned };
}
