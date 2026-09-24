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
export function describeJoinStatus(
  mode: JoinMode,
  code: string,
  peek: SessionPeekResponse | null,
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
  if (peek?.exists) {
    return status('That code is already in use — pick another.', 'warn', true);
  }
  // Not blocked while the lookup is in flight: hosting shouldn't feel laggy,
  // and a fresh random code is almost never taken.
  return status('Share this code with your players once you’re in.', 'muted', false);
}
