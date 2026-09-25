import { describe, expect, it } from 'vitest';
import type { LogEntry } from '@custom-tabletop/shared';
import { feedEntries, rollBreakdown, rollBubble, rollFlavor, rollSummary } from './logFormat.js';

type RollEntry = Extract<LogEntry, { kind: 'roll' }>;

function roll(overrides: Partial<RollEntry>): RollEntry {
  return {
    id: 'r',
    at: 0,
    kind: 'roll',
    playerId: 'p',
    name: 'Alice',
    color: 'red',
    dice: [],
    modifier: 0,
    total: 0,
    ...overrides,
  };
}

describe('roll formatting', () => {
  it('summarizes table dice by size, or shows the typed notation', () => {
    const table = roll({
      dice: [
        { sides: 6, result: 4 },
        { sides: 20, result: 17 },
        { sides: 6, result: 2 },
      ],
    });
    expect(rollSummary(table)).toBe('2d6+1d20');
    expect(rollSummary(roll({ notation: '1d20+5' }))).toBe('1d20+5');
  });

  it('breaks a roll down into its terms', () => {
    const typed = roll({
      dice: [
        { sides: 6, result: 4 },
        { sides: 6, result: 2 },
        { sides: 4, result: 3, subtract: true },
      ],
      modifier: -1,
    });
    expect(rollBreakdown(typed)).toBe('4 + 2 − 3 − 1');
  });

  it('calls out a natural 20 or 1 on a lone d20', () => {
    const d20 = (result: number) => roll({ dice: [{ sides: 20, result }], total: result });
    expect(rollFlavor(d20(20))).toBe('critical');
    expect(rollFlavor(d20(1))).toBe('fumble');
    expect(rollFlavor(d20(12))).toBeNull();
    expect(rollBubble({ ...d20(20), notation: '1d20' })).toBe('🎲 1d20 → 20 — nat 20!');
    // Advantage-style double d20s aren't a single natural roll.
    expect(
      rollFlavor(
        roll({
          dice: [
            { sides: 20, result: 20 },
            { sides: 20, result: 3 },
          ],
        }),
      ),
    ).toBeNull();
  });
});

describe('feedEntries', () => {
  const log = ['old', 'a', 'b', 'c'].map((id) => ({ id }));

  it('never pops up history, and drops lines once they are old', () => {
    const seenAt = new Map([
      ['old', -Infinity],
      ['a', 1000],
      ['b', 9000],
      ['c', 12_000],
    ]);
    // Only 3 s into the page: history must still stay hidden.
    expect(feedEntries(log.slice(0, 2), seenAt, 3000, 12, 6).map((entry) => entry.id)).toEqual([
      'a',
    ]);
    expect(feedEntries(log, seenAt, 14_000, 12, 6).map((entry) => entry.id)).toEqual(['b', 'c']);
  });

  it('shows at most the newest few', () => {
    const seenAt = new Map(log.map((entry) => [entry.id, 0]));
    expect(feedEntries(log, seenAt, 1000, 12, 2).map((entry) => entry.id)).toEqual(['b', 'c']);
  });
});
