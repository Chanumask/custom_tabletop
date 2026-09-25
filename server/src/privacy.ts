import type { GameState } from '@custom-tabletop/shared';

/**
 * What one player may see of a table (docs/decisions.md, "Secret dice"):
 * the host's secret dice, and the log lines of their rolls, only ever reach
 * their owner. Every piece of state the server sends goes through this —
 * hiding them on screen wouldn't do, since anyone can read what their
 * browser receives. A walkie-talkie message (gadgets phase 4) reuses the
 * same mechanism: its `visibleTo` just names two players instead of one.
 */
export function viewFor(state: GameState, playerId: string | null): GameState {
  if (!hasPrivate(state)) {
    return state;
  }
  return {
    ...state,
    dice: state.dice.filter((die) => !die.hidden || die.ownerId === playerId),
    log: state.log.filter(
      (entry) =>
        (entry.kind !== 'roll' || !entry.visibleTo || entry.visibleTo === playerId) &&
        (entry.kind !== 'radio' || (playerId !== null && entry.visibleTo.includes(playerId))),
    ),
  };
}

/** Whether anything in the state is private to someone. */
export function hasPrivate(state: GameState): boolean {
  return (
    state.dice.some((die) => die.hidden) ||
    state.log.some(
      (entry) => (entry.kind === 'roll' && Boolean(entry.visibleTo)) || entry.kind === 'radio',
    )
  );
}
