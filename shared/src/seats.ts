/**
 * The chairs at the table (docs/decisions.md, "Chairs"): four stand there
 * always; with more players, one more per extra player (up to eight, two
 * to a side), and they go away again as players leave.
 */
import { MAX_PLAYERS_PER_SESSION } from './player.js';
import type { Player } from './types.js';

/** The table always has at least this many chairs. */
export const MIN_CHAIRS = 4;

/** How many chairs stand at the table for `playerCount` players. Everyone
 * at the table counts — a player reconnecting keeps their chair. */
export function chairCount(playerCount: number): number {
  return Math.min(MAX_PLAYERS_PER_SESSION, Math.max(MIN_CHAIRS, playerCount));
}

export type TableSide = 'N' | 'E' | 'S' | 'W';

/**
 * Seat index -> which chair. First one chair per side (opposite sides
 * first), then each side's second chair in the order the sides gain one.
 * So a seat index always means the same chair, and the chairs a table of
 * `n` has are exactly seats `0..n-1`.
 */
export const SEAT_SLOTS: readonly { side: TableSide; second: boolean }[] = [
  { side: 'N', second: false },
  { side: 'S', second: false },
  { side: 'E', second: false },
  { side: 'W', second: false },
  { side: 'N', second: true },
  { side: 'S', second: true },
  { side: 'E', second: true },
  { side: 'W', second: true },
];

/** Whether `side` has its second chair out, at a table of `count` chairs
 * (otherwise its one chair stands in the middle of the side). */
export function sideHasTwo(side: TableSide, count: number): boolean {
  return SEAT_SLOTS.findIndex((slot) => slot.side === side && slot.second) < count;
}

/**
 * After the table lost chairs: anyone seated on a chair that's gone (or,
 * from an old save, sharing one) moves to the lowest free chair. There's
 * always one — nobody sits without being a player, and there are at least
 * as many chairs as players. Mutates `players`; returns who moved.
 */
export function settleSeats(players: Player[], count: number): Player[] {
  const taken = new Set<number>();
  const homeless: Player[] = [];
  for (const player of players) {
    if (!player.seated || player.seatIndex === null) continue;
    if (player.seatIndex < count && !taken.has(player.seatIndex)) {
      taken.add(player.seatIndex);
    } else {
      homeless.push(player);
    }
  }
  for (const player of homeless) {
    let free = 0;
    while (free < count && taken.has(free)) free += 1;
    player.seatIndex = free < count ? free : null;
    if (player.seatIndex !== null) taken.add(player.seatIndex);
  }
  return homeless;
}
