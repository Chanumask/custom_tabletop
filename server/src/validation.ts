import {
  CLEAR_TARGETS,
  MAX_SCENE_NAME_LENGTH,
  type SceneDeleteRequest,
  ROOM_THEMES,
  type HostActionRequest,
  type DiceMoveRequest,
  type MiniMoveRequest,
  CLIP_ACTIONS,
  MAX_CLIP_POSITION,
  type ClipAction,
  type ClipControlRequest,
  type ClipLockRequest,
  MAX_SESSION_ID_LENGTH,
  MAX_CHAT_LENGTH,
  MAX_DICE_PER_ROLL,
  MAX_SEAT_INDEX,
  isGridCells,
  type TablePingRequest,
  MAX_PLAYER_NAME_LENGTH,
  type ChatSendRequest,
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
  type ItemTakeRequest,
  type ItemDropRequest,
  type PhotoCaptureRequest,
  type FlashlightToggleRequest,
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

  const { sessionId, playerId, playerName, playerToken, resume, color, hostKey } =
    payload as Record<string, unknown>;
  if (
    !isSessionCode(sessionId) ||
    !isNonEmptyString(playerId) ||
    !isPlayerName(playerName) ||
    !isNonEmptyString(playerToken) ||
    playerToken.length > MAX_TOKEN_LENGTH ||
    (resume !== undefined && typeof resume !== 'boolean') ||
    (color !== undefined && !isPlayerColorId(color)) ||
    (hostKey !== undefined && (typeof hostKey !== 'string' || hostKey.length > MAX_TOKEN_LENGTH))
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
    ...(hostKey === undefined || hostKey === '' ? {} : { hostKey }),
  };
}

/** A session code: non-empty and at most `MAX_SESSION_ID_LENGTH` once
 * trimmed — it names the table's save file (tableArchive.ts). */
function isSessionCode(value: unknown): value is string {
  return isNonEmptyString(value) && value.trim().length <= MAX_SESSION_ID_LENGTH;
}

function isPlayerName(value: unknown): value is string {
  return isNonEmptyString(value) && value.trim().length <= MAX_PLAYER_NAME_LENGTH;
}

export function parseSessionPeekRequest(payload: unknown): SessionPeekRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const { sessionId } = payload as Record<string, unknown>;
  return isSessionCode(sessionId) ? { sessionId: sessionId.trim() } : null;
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
    name.trim().length > MAX_SCENE_NAME_LENGTH ||
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

  const { sessionId, playerId, sceneId, name, backgroundImage, gridCells } = payload as Record<
    string,
    unknown
  >;
  if (
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(playerId) ||
    !isNonEmptyString(sceneId) ||
    !isOptionalString(name) ||
    (name !== undefined && (!name.trim() || name.trim().length > MAX_SCENE_NAME_LENGTH)) ||
    !isOptionalString(backgroundImage) ||
    (gridCells !== undefined && !isGridCells(gridCells))
  ) {
    return null;
  }
  if (name === undefined && backgroundImage === undefined && gridCells === undefined) {
    return null; // nothing to update
  }

  return {
    sessionId: sessionId.trim(),
    playerId: playerId.trim(),
    sceneId: sceneId.trim(),
    name: name?.trim(),
    backgroundImage,
    ...(gridCells !== undefined ? { gridCells } : {}),
  };
}

/** scene:delete — which map to remove. */
export function parseSceneDeleteRequest(payload: unknown): SceneDeleteRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const { sessionId, playerId, sceneId } = payload as Record<string, unknown>;
  if (!isNonEmptyString(sessionId) || !isNonEmptyString(playerId) || !isNonEmptyString(sceneId)) {
    return null;
  }
  return { sessionId: sessionId.trim(), playerId: playerId.trim(), sceneId: sceneId.trim() };
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

  const { sessionId, playerId, diceId, position, kind, hidden } = payload as Record<
    string,
    unknown
  >;
  if (
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(playerId) ||
    !isNonEmptyString(diceId) ||
    !isVector3(position) ||
    (kind !== undefined && !isDieKind(kind)) ||
    (hidden !== undefined && typeof hidden !== 'boolean')
  ) {
    return null;
  }

  return {
    sessionId: sessionId.trim(),
    playerId: playerId.trim(),
    diceId: diceId.trim(),
    position,
    kind: kind ?? 'd6',
    ...(hidden ? { hidden: true } : {}),
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

  const { sessionId, playerId, objectId, seated, seatIndex } = payload as Record<string, unknown>;
  if (
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(playerId) ||
    !isNonEmptyString(objectId) ||
    (seated !== undefined && typeof seated !== 'boolean') ||
    (seatIndex !== undefined &&
      !(
        Number.isInteger(seatIndex) &&
        (seatIndex as number) >= 0 &&
        (seatIndex as number) <= MAX_SEAT_INDEX
      ))
  ) {
    return null;
  }

  return {
    sessionId: sessionId.trim(),
    playerId: playerId.trim(),
    objectId: objectId.trim(),
    ...(seated !== undefined ? { seated } : {}),
    ...(seatIndex !== undefined ? { seatIndex: seatIndex as number } : {}),
  };
}

export function parseItemTakeRequest(payload: unknown): ItemTakeRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, itemId } = payload as Record<string, unknown>;
  if (!isNonEmptyString(sessionId) || !isNonEmptyString(playerId) || !isNonEmptyString(itemId)) {
    return null;
  }

  return { sessionId: sessionId.trim(), playerId: playerId.trim(), itemId: itemId.trim() };
}

export function parseItemDropRequest(payload: unknown): ItemDropRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, itemId } = payload as Record<string, unknown>;
  if (!isNonEmptyString(sessionId) || !isNonEmptyString(playerId) || !isNonEmptyString(itemId)) {
    return null;
  }

  return { sessionId: sessionId.trim(), playerId: playerId.trim(), itemId: itemId.trim() };
}

export function parsePhotoCaptureRequest(payload: unknown): PhotoCaptureRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, url } = payload as Record<string, unknown>;
  if (
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(playerId) ||
    !isNonEmptyString(url) ||
    url.length > MAX_URL_LENGTH ||
    !isHttpUrl(url.trim())
  ) {
    return null;
  }

  return { sessionId: sessionId.trim(), playerId: playerId.trim(), url: url.trim() };
}

export function parseFlashlightToggleRequest(payload: unknown): FlashlightToggleRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId } = payload as Record<string, unknown>;
  if (!isNonEmptyString(sessionId) || !isNonEmptyString(playerId)) {
    return null;
  }

  return { sessionId: sessionId.trim(), playerId: playerId.trim() };
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

export function parseChatSendRequest(payload: unknown): ChatSendRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, text } = payload as Record<string, unknown>;
  if (!isNonEmptyString(sessionId) || !isNonEmptyString(playerId) || typeof text !== 'string') {
    return null;
  }
  const cleaned = withoutControlChars(text).trim();
  if (!cleaned || cleaned.length > MAX_CHAT_LENGTH) {
    return null;
  }

  return { sessionId: sessionId.trim(), playerId: playerId.trim(), text: cleaned };
}

export function parseTablePingRequest(payload: unknown): TablePingRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { sessionId, playerId, point } = payload as Record<string, unknown>;
  if (!isNonEmptyString(sessionId) || !isNonEmptyString(playerId) || !isPoint2D(point)) {
    return null;
  }

  return {
    sessionId: sessionId.trim(),
    playerId: playerId.trim(),
    point: { x: point.x, y: point.y },
  };
}

/** clip:control — a known action at a sane position (clip.ts). */
export function parseClipControlRequest(payload: unknown): ClipControlRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const { sessionId, playerId, clipId, action, position } = payload as Record<string, unknown>;
  if (
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(playerId) ||
    !isNonEmptyString(clipId) ||
    typeof action !== 'string' ||
    !(CLIP_ACTIONS as readonly string[]).includes(action) ||
    typeof position !== 'number' ||
    !Number.isFinite(position) ||
    position < 0 ||
    position > MAX_CLIP_POSITION
  ) {
    return null;
  }
  return { sessionId, playerId, clipId, action: action as ClipAction, position };
}

/** clip:lock — the host locks or unlocks the clip's controls. */
export function parseClipLockRequest(payload: unknown): ClipLockRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const { sessionId, playerId, locked } = payload as Record<string, unknown>;
  if (!isNonEmptyString(sessionId) || !isNonEmptyString(playerId) || typeof locked !== 'boolean') {
    return null;
  }
  return { sessionId, playerId, locked };
}

/** host:action — one of the host's controls (host.ts). */
export function parseHostActionRequest(payload: unknown): HostActionRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const fields = payload as Record<string, unknown>;
  const { sessionId, playerId, action } = fields;
  if (!isNonEmptyString(sessionId) || !isNonEmptyString(playerId)) {
    return null;
  }
  const base = { sessionId, playerId };
  if (action === 'lock' && typeof fields.locked === 'boolean') {
    return { ...base, action, locked: fields.locked };
  }
  if (
    action === 'permission' &&
    (fields.permission === 'draw' || fields.permission === 'sounds') &&
    typeof fields.allowed === 'boolean'
  ) {
    return { ...base, action, permission: fields.permission, allowed: fields.allowed };
  }
  if (action === 'remove' && isNonEmptyString(fields.targetPlayerId)) {
    return { ...base, action, targetPlayerId: fields.targetPlayerId };
  }
  const theme = ROOM_THEMES.find((candidate) => candidate === fields.theme);
  if (action === 'theme' && theme) {
    return { ...base, action, theme };
  }
  const target = CLEAR_TARGETS.find((candidate) => candidate === fields.target);
  if (action === 'clear' && target) {
    return { ...base, action, target };
  }
  return null;
}

/** A position sane enough to be somewhere around the table. */
function isNearTable(value: unknown): value is Vector3 {
  return (
    isVector3(value) && Math.abs(value.x) < 20 && Math.abs(value.z) < 20 && Math.abs(value.y) < 10
  );
}

/** mini:move — whose mini, and where (or null: off the table). */
export function parseMiniMoveRequest(payload: unknown): MiniMoveRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const { sessionId, playerId, targetPlayerId, point } = payload as Record<string, unknown>;
  if (
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(playerId) ||
    !isNonEmptyString(targetPlayerId) ||
    (point !== null && !isPoint2D(point))
  ) {
    return null;
  }
  return {
    sessionId,
    playerId,
    targetPlayerId,
    point: point === null ? null : { x: point.x, y: point.y },
  };
}

/** dice:move — which die, and where it rests now. */
export function parseDiceMoveRequest(payload: unknown): DiceMoveRequest | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const { sessionId, playerId, diceId, position } = payload as Record<string, unknown>;
  if (
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(playerId) ||
    !isNonEmptyString(diceId) ||
    !isNearTable(position)
  ) {
    return null;
  }
  return { sessionId, playerId, diceId, position: { x: position.x, y: position.y, z: position.z } };
}
