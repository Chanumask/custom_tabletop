import { describe, expect, it } from 'vitest';
import { SEAT_SLOTS, chairCount, settleSeats, sideHasTwo } from './seats.js';
import type { Player } from './types.js';

function seated(id: string, seatIndex: number | null): Player {
  return {
    id,
    name: id,
    color: 'red',
    muted: false,
    connected: true,
    position: { x: 0, y: 1.7, z: 0 },
    rotationY: 0,
    seated: seatIndex !== null,
    seatIndex,
  } as Player;
}

describe('chairs at the table', () => {
  it('four at least, one more per extra player, eight at most', () => {
    expect([0, 1, 4, 5, 7, 8, 12].map(chairCount)).toEqual([4, 4, 4, 5, 7, 8, 8]);
  });

  it('gives each side one chair first, then opposite sides their second', () => {
    expect(
      SEAT_SLOTS.slice(0, 4)
        .map((slot) => slot.side)
        .sort(),
    ).toEqual(['E', 'N', 'S', 'W']);
    expect(['N', 'S', 'E', 'W'].map((side) => sideHasTwo(side as 'N', 4))).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(sideHasTwo('N', 5)).toBe(true);
    expect(sideHasTwo('S', 5)).toBe(false);
    expect(sideHasTwo('S', 6)).toBe(true);
    expect(sideHasTwo('W', 8)).toBe(true);
    expect(sideHasTwo('W', 7)).toBe(false);
  });

  it('moves anyone off a chair that went away, to the lowest free one', () => {
    const players = [seated('a', 0), seated('b', 6), seated('c', null), seated('d', 2)];
    const moved = settleSeats(players, 4);
    expect(moved.map((player) => player.id)).toEqual(['b']);
    expect(players.map((player) => player.seatIndex)).toEqual([0, 1, null, 2]);
  });

  it('untangles two players on one chair (an old save)', () => {
    const players = [seated('a', 1), seated('b', 1)];
    settleSeats(players, 4);
    expect(players.map((player) => player.seatIndex)).toEqual([1, 0]);
  });

  it('leaves standing players alone', () => {
    const standing = { ...seated('a', null), seatIndex: 5 };
    standing.seated = false;
    expect(settleSeats([standing], 4)).toEqual([]);
    expect(standing.seatIndex).toBe(5);
  });
});
