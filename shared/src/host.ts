/**
 * The host's controls (docs/decisions.md, "Host controls"): lock the table
 * to newcomers, remove a player, decide what players may do, and clear
 * things off the table. One host-only event, `host:action`, carries them all.
 */
import type { GameState } from './types.js';
import type { Weather } from './room.js';

/** What the host can turn off for everyone else (the host always may). */
export interface TablePermissions {
  /** Draw on (and erase from) the map. */
  draw: boolean;
  /** Play, add and arrange sounds — and start clips on the TV. */
  sounds: boolean;
}

export type TablePermission = keyof TablePermissions;

export const DEFAULT_PERMISSIONS: TablePermissions = { draw: true, sounds: true };

/** How the room is dressed (docs/decisions.md, "Halloween"): the host's
 * choice, the same for everyone — the world outside the windows too. */
export const ROOM_THEMES = ['classic', 'halloween', 'winter'] as const;
export type RoomTheme = (typeof ROOM_THEMES)[number];

/** What "clear" can sweep off: the active map's drawings, the whiteboard,
 * every die, or every mini. */
export const CLEAR_TARGETS = ['drawings', 'whiteboard', 'dice', 'minis', 'photos'] as const;
export type ClearTarget = (typeof CLEAR_TARGETS)[number];

/** The host's mood presets (docs/decisions.md, "The cozy room"): each sets
 * a few of the room's own switches at once — the lights, the candles, the
 * fire, the weather, the record — which all stay theirs to change by hand. */
export const MOODS = [
  { id: 'story', label: 'Story time', hint: 'lights down, candles and the fire, soft music' },
  { id: 'break', label: 'Break', hint: 'lights up, a tavern tune — time for tea' },
  { id: 'storm', label: 'Storm', hint: 'lights down, the storm rolls in, candles lit' },
] as const;
export type Mood = (typeof MOODS)[number]['id'];

export type HostAction =
  | { action: 'lock'; locked: boolean }
  | { action: 'permission'; permission: TablePermission; allowed: boolean }
  | { action: 'remove'; targetPlayerId: string }
  | { action: 'clear'; target: ClearTarget }
  | { action: 'theme'; theme: RoomTheme }
  | { action: 'weather'; weather: Weather }
  /** A new book (no `bookId`) or a rewrite of one (books.ts). */
  | { action: 'writeBook'; bookId?: string; title: string; text: string; cover: number }
  | { action: 'removeBook'; bookId: string }
  | { action: 'mood'; mood: Mood };

export type HostActionRequest = { sessionId: string; playerId: string } & HostAction;

export type HostActionResponse = { ok: true; state: GameState } | { ok: false; error: string };

/** `session:removed` — sent only to the player the host just removed. */
export interface SessionRemoved {
  sessionId: string;
}

export const HOST_ONLY_ERROR = 'Only the host can do that.';
export const TABLE_LOCKED_ERROR = 'The host has locked this table — nobody new can join right now.';
export const REMOVED_FROM_TABLE_ERROR = 'The host removed you from this table.';
export const DRAWING_OFF_ERROR = 'The host has turned drawing off for now.';
export const SOUNDS_OFF_ERROR = 'The host has turned sounds off for now.';

/** Whether `playerId` may do what `permission` covers at this table. */
export function mayUse(state: GameState, playerId: string, permission: TablePermission): boolean {
  return state.hostId === playerId || state.permissions[permission];
}
