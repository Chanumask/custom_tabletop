import type { GameState, Player } from '@custom-tabletop/shared';

/**
 * What one player may see of a table (docs/decisions.md, "Secret dice"):
 * the host's secret dice, and the log lines of their rolls, only ever reach
 * their owner. Every piece of state the server sends goes through this —
 * hiding them on screen wouldn't do, since anyone can read what their
 * browser receives. A walkie-talkie message (gadgets phase 4) reuses the
 * same mechanism: its `visibleTo` just names two players instead of one.
 * A player's profile image (docs/decisions.md, "Player profiles") is seen
 * by that player and whoever is host right now; everyone else doesn't
 * even learn there is one.
 */
export function viewFor(state: GameState, playerId: string | null): GameState {
  if (!hasPrivate(state)) {
    return state;
  }
  const isHost = playerId !== null && state.hostId === playerId;
  return {
    ...state,
    players: isHost
      ? state.players
      : state.players.map((player) =>
          player.profileImage && player.id !== playerId ? withoutProfileImage(player) : player,
        ),
    dice: state.dice.filter((die) => !die.hidden || die.ownerId === playerId),
    log: state.log.filter(
      (entry) =>
        (entry.kind !== 'roll' || !entry.visibleTo || entry.visibleTo === playerId) &&
        (entry.kind !== 'radio' || (playerId !== null && entry.visibleTo.includes(playerId))),
    ),
  };
}

function withoutProfileImage(player: Player): Player {
  return { ...player, profileImage: null };
}

/** Whether anything in the state is private to someone. */
export function hasPrivate(state: GameState): boolean {
  return (
    state.dice.some((die) => die.hidden) ||
    state.log.some(
      (entry) => (entry.kind === 'roll' && Boolean(entry.visibleTo)) || entry.kind === 'radio',
    ) ||
    state.players.some((player) => Boolean(player.profileImage))
  );
}
