import { describe, expect, it } from 'vitest';
import { parseDiceNotation, rollCommand } from './diceNotation.js';
import { appendLogEntry, MAX_LOG_ENTRIES, type LogEntry } from './log.js';

describe('parseDiceNotation', () => {
  it('reads dice, counts and modifiers', () => {
    expect(parseDiceNotation('d20+5')).toEqual({
      groups: [{ count: 1, sides: 20 }],
      modifier: 5,
      text: '1d20+5',
    });
    expect(parseDiceNotation(' 2d6 + 1D4 - 1 ')).toEqual({
      groups: [
        { count: 2, sides: 6 },
        { count: 1, sides: 4 },
      ],
      modifier: -1,
      text: '2d6+1d4-1',
    });
    expect(parseDiceNotation('4d6-1d6')?.groups).toEqual([
      { count: 4, sides: 6 },
      { count: -1, sides: 6 },
    ]);
  });

  it.each(['', '5', 'd', 'd1', '2d', 'fireball', '2d6++1', '0d6', '51d6', 'd1001', '2d6*2'])(
    'rejects %j',
    (notation) => {
      expect(parseDiceNotation(notation)).toBeNull();
    },
  );
});

describe('rollCommand', () => {
  it('recognizes /roll and /r, with or without notation', () => {
    expect(rollCommand('/roll 2d6+3')).toBe('2d6+3');
    expect(rollCommand('/R d20')).toBe('d20');
    expect(rollCommand('/roll')).toBe('');
  });

  it('leaves ordinary chat alone', () => {
    expect(rollCommand('rolling for initiative')).toBeNull();
    expect(rollCommand('/rolls')).toBeNull();
  });
});

describe('appendLogEntry', () => {
  const entry = (id: string): LogEntry => ({ id, at: 0, kind: 'system', text: id });

  it('keeps only the most recent entries', () => {
    let log: LogEntry[] = [];
    for (let i = 0; i < MAX_LOG_ENTRIES + 5; i++) {
      log = appendLogEntry(log, entry(String(i)));
    }
    expect(log).toHaveLength(MAX_LOG_ENTRIES);
    expect(log[0]!.id).toBe('5');
  });

  it('ignores an entry it already has', () => {
    const log = [entry('a')];
    expect(appendLogEntry(log, entry('a'))).toBe(log);
  });
});
