import {
  MAX_PLAYERS_PER_SESSION,
  type PlayerColorId,
  type SessionPeekResponse,
} from '@custom-tabletop/shared';

export type JoinMode = 'host' | 'join';

export interface JoinStatus {
  /** One line under the code field; null when there's nothing to say. */
  message: string | null;
  tone: 'muted' | 'ok' | 'warn';
  /** The primary action can't go ahead. */
  blocked: boolean;
  /** Colors of the players already at that table (joining only). */
  present: PlayerColorId[];
}

/**
 * What the join screen says about the session code on screen, from the
 * live `session:peek` result for exactly that code (`null` while the lookup
 * is in flight). Pure, so every branch is unit-tested.
 */
/** "just now", "5 minutes ago", "yesterday", "3 days ago". */
export function lastPlayed(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** A saved table's status line — reopenable only by its host. */
function savedTableStatus(
  mode: JoinMode,
  peek: SessionPeekResponse,
  ownsSavedTable: boolean,
  now: number,
): Pick<JoinStatus, 'message' | 'tone' | 'blocked'> {
  const when = peek.lastActiveAt ? ` · last played ${lastPlayed(peek.lastActiveAt, now)}` : '';
  if (ownsSavedTable) {
    return {
      message: `Your saved table${when} — it reopens just as you left it.`,
      tone: 'ok',
      blocked: false,
    };
  }
  if (mode === 'host') {
    return {
      message: 'That code belongs to a saved table — pick another.',
      tone: 'warn',
      blocked: true,
    };
  }
  const host = peek.hostName ? ` for ${peek.hostName}` : ' for its host';
  return {
    message: `This table is saved${when} — waiting${host} to reopen it.`,
    tone: 'warn',
    blocked: true,
  };
}

export function describeJoinStatus(
  mode: JoinMode,
  code: string,
  peek: SessionPeekResponse | null,
  /** This browser holds the host key for that code (hostKeys.ts). */
  ownsSavedTable = false,
  now = Date.now(),
): JoinStatus {
  const status = (
    message: string | null,
    tone: JoinStatus['tone'],
    blocked: boolean,
    present: PlayerColorId[] = [],
  ): JoinStatus => ({ message, tone, blocked, present });

  if (mode === 'join') {
    if (!code) {
      return status('Enter the code your host shared with you.', 'muted', true);
    }
    if (!peek) {
      return status('Looking up session…', 'muted', true);
    }
    if (!peek.exists) {
      return status('No session with that code — check it, or host a new one.', 'warn', true);
    }
    if (peek.saved) {
      const saved = savedTableStatus(mode, peek, ownsSavedTable, now);
      return status(saved.message, saved.tone, saved.blocked);
    }
    if (peek.locked) {
      return status(
        'The host has locked this table — nobody new can join right now.',
        'warn',
        true,
      );
    }
    if (peek.playerCount >= MAX_PLAYERS_PER_SESSION) {
      return status(`That table is full (${MAX_PLAYERS_PER_SESSION} players).`, 'warn', true);
    }
    const players = `${peek.playerCount} player${peek.playerCount === 1 ? '' : 's'} at the table`;
    return status(
      peek.hostName ? `${players} · hosted by ${peek.hostName}` : players,
      'ok',
      false,
      peek.takenColors,
    );
  }

  if (!code) {
    return status('Pick a code for your table.', 'muted', true);
  }
  if (peek?.saved) {
    const saved = savedTableStatus(mode, peek, ownsSavedTable, now);
    return status(saved.message, saved.tone, saved.blocked);
  }
  if (peek?.exists) {
    return status('That code is already in use — pick another.', 'warn', true);
  }
  // Not blocked while the lookup is in flight: hosting shouldn't feel laggy,
  // and a fresh random code is almost never taken.
  return status('Share this code with your players once you’re in.', 'muted', false);
}
