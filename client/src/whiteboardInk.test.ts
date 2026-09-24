import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '@custom-tabletop/shared';
import {
  BOARD_COLOR,
  DEFAULT_INK,
  contrastRatio,
  inkColorFor,
  legibleInk,
} from './whiteboardInk.js';

describe('inkColorFor', () => {
  const line = { text: 'hi', authorId: 'mia', color: 'red' as const };

  it("uses the author's current color while they're present", () => {
    expect(inkColorFor(line, [{ id: 'mia', color: 'purple' }])).toBe('#9160d6');
  });

  it('falls back to the color they wrote with once they have left', () => {
    expect(inkColorFor(line, [])).toBe('#d9443b');
  });

  it('uses plain marker ink when nothing is known', () => {
    expect(inkColorFor({ text: 'x', authorId: null, color: null }, [])).toBe(DEFAULT_INK);
  });

  it('darkens a light author color so it stays readable', () => {
    const ink = inkColorFor({ ...line, color: 'yellow' }, []);
    expect(ink).not.toBe('#e9c33b');
    expect(contrastRatio(ink, BOARD_COLOR)).toBeGreaterThanOrEqual(3.5);
  });
});

describe('contrastRatio', () => {
  it('matches the WCAG extremes', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });
});

describe('legibleInk', () => {
  it('leaves already-dark colors alone', () => {
    expect(legibleInk('#d9443b')).toBe('#d9443b');
    expect(legibleInk(DEFAULT_INK)).toBe(DEFAULT_INK);
  });

  it('makes every player color readable on the board', () => {
    for (const { hex } of PLAYER_COLORS) {
      expect(contrastRatio(legibleInk(hex), BOARD_COLOR)).toBeGreaterThanOrEqual(3.5);
    }
  });

  it('keeps the hue when darkening (only scales the channels)', () => {
    const [r, g, b] = [1, 3, 5].map((i) =>
      Number.parseInt(legibleInk('#e9c33b').slice(i, i + 2), 16),
    );
    expect(r! / g!).toBeCloseTo(0xe9 / 0xc3, 1);
    expect(g! / b!).toBeCloseTo(0xc3 / 0x3b, 0);
  });
});
