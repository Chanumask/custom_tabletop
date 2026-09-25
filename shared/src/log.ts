/**
 * The session log: chat, every dice roll, and arrivals/departures — one
 * shared, ordered history everyone sees (the last `MAX_LOG_ENTRIES` are
 * kept in `GameState.log`, so a late joiner gets the recent story).
 *
 * Chat is sent with `chat:send` and each new entry is broadcast on its own
 * (`log:entry`) rather than as a full-state broadcast — a chatty table
 * shouldn't resend every drawing on the map with every "lol". Rolls and
 * join/leave entries ride along with the full `session:state` those
 * actions already broadcast.
 */
export const MAX_LOG_ENTRIES = 100;
export const MAX_CHAT_LENGTH = 200;

import type { PlayerColorId } from './player.js';

/** Who said or rolled something, as they were at the time — so their lines
 * keep a name and color after they've left the table. */
export interface LogAuthor {
  playerId: string;
  name: string;
  color: PlayerColorId;
}

/** One die in a logged roll. */
export interface LoggedDie {
  sides: number;
  result: number;
  /** Counts against the total (the 1d6 of "4d6-1d6"). */
  subtract?: boolean;
}

export type LogEntry =
  | ({ id: string; at: number; kind: 'chat'; text: string } & LogAuthor)
  | ({
      id: string;
      at: number;
      kind: 'roll';
      dice: LoggedDie[];
      /** A flat bonus/penalty (typed rolls only, e.g. the +3 of 2d6+3). */
      modifier: number;
      total: number;
      /** How a typed roll was written ("2d6+3"); absent for table dice. */
      notation?: string;
      /** A secret roll: only this player sees the line (secret dice). */
      visibleTo?: string;
    } & LogAuthor)
  | { id: string; at: number; kind: 'system'; text: string }
  | ({
      id: string;
      at: number;
      kind: 'radio';
      text: string;
      /** The two walkie-talkie holders this reaches (gadgets phase 4) —
       * always exactly the sender and the other current holder; nobody
       * else's client ever sees this entry (privacy.ts, the same
       * mechanism a secret roll's single-player `visibleTo` above uses). */
      visibleTo: string[];
    } & LogAuthor);

/** chat:send — a line of chat, or a typed roll (`/roll 2d6+3`, `/r d20`). */
export interface ChatSendRequest {
  sessionId: string;
  playerId: string;
  text: string;
}

export type ChatSendResponse = { ok: true } | { ok: false; error: string };

/** Payload of the log:entry broadcast. */
export interface LogEntryBroadcast {
  sessionId: string;
  entry: LogEntry;
}

/** Keeps a log to its last `MAX_LOG_ENTRIES`, adding `entry` if it's new. */
export function appendLogEntry(log: LogEntry[], entry: LogEntry): LogEntry[] {
  if (log.some((existing) => existing.id === entry.id)) {
    return log;
  }
  return [...log, entry].slice(-MAX_LOG_ENTRIES);
}
