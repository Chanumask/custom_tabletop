/**
 * The whiteboard on the room's north wall: a fixed number of text lines,
 * shared by everyone. A player writes by editing the lines and saving;
 * every line keeps the color of whoever last wrote it (so a board filled by
 * several players shows who wrote what at a glance).
 */
import type { GameState } from './types.js';
import type { PlayerColorId } from './player.js';

/** Six lines: enough for a scene's notes, initiative order or a riddle, and
 * still large enough to read from across the room. */
export const WHITEBOARD_LINE_COUNT = 6;
/** Longest line the board fits at a readable size. */
export const WHITEBOARD_MAX_LINE_LENGTH = 42;

export interface WhiteboardLine {
  text: string;
  /** Who wrote this line last (null for an empty line). Clients draw it in
   * that player's *current* color while they're in the session... */
  authorId: string | null;
  /** ...and fall back to the color they had when they wrote it once they've
   * left. */
  color: PlayerColorId | null;
}

export function emptyWhiteboard(): WhiteboardLine[] {
  return Array.from({ length: WHITEBOARD_LINE_COUNT }, () => ({
    text: '',
    authorId: null,
    color: null,
  }));
}

/** whiteboard:write — one entry per board line: the text the writer wants
 * there, or `null` for a line they didn't touch. Sending only the edited
 * lines means two players writing at once never undo each other (a stale
 * copy of someone else's line is never sent back). A line whose text
 * actually changes is re-attributed to the writer. Ack + full-state
 * broadcast (infrequent). Open to every player. */
export interface WhiteboardWriteRequest {
  sessionId: string;
  playerId: string;
  lines: (string | null)[];
}

export type WhiteboardWriteResponse = { ok: true; state: GameState } | { ok: false; error: string };
