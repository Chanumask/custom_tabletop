import { describe, expect, it } from 'vitest';
import type { SessionPeekResponse } from '@custom-tabletop/shared';
import { describeJoinStatus, lastPlayed } from './joinStatus.js';

const missing: SessionPeekResponse = {
  exists: false,
  playerCount: 0,
  hostName: null,
  takenColors: [],
};
const table = (playerCount: number): SessionPeekResponse => ({
  exists: true,
  playerCount,
  hostName: 'Alice',
  takenColors: ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'teal'].slice(
    0,
    playerCount,
  ) as SessionPeekResponse['takenColors'],
});

describe('describeJoinStatus — joining', () => {
  it('asks for a code, then waits for the lookup', () => {
    expect(describeJoinStatus('join', '', null)).toMatchObject({ tone: 'muted', blocked: true });
    expect(describeJoinStatus('join', 'ABCDE', null)).toMatchObject({
      message: 'Looking up session…',
      blocked: true,
    });
  });

  it('blocks an unknown code and a full table', () => {
    expect(describeJoinStatus('join', 'ABCDE', missing)).toMatchObject({
      tone: 'warn',
      blocked: true,
    });
    expect(describeJoinStatus('join', 'ABCDE', table(8))).toMatchObject({
      message: 'That table is full (8 players).',
      blocked: true,
    });
  });

  it('shows who is there', () => {
    expect(describeJoinStatus('join', 'ABCDE', table(1))).toEqual({
      message: '1 player at the table · hosted by Alice',
      tone: 'ok',
      blocked: false,
      present: ['red'],
    });
    expect(describeJoinStatus('join', 'ABCDE', table(3)).message).toBe(
      '3 players at the table · hosted by Alice',
    );
  });
});

describe('describeJoinStatus — hosting', () => {
  it('needs a code and refuses one already in use', () => {
    expect(describeJoinStatus('host', '', null).blocked).toBe(true);
    expect(describeJoinStatus('host', 'ABCDE', table(2))).toMatchObject({
      tone: 'warn',
      blocked: true,
      present: [],
    });
  });

  it('does not wait on the lookup for a fresh code', () => {
    expect(describeJoinStatus('host', 'ABCDE', null).blocked).toBe(false);
    expect(describeJoinStatus('host', 'ABCDE', missing).blocked).toBe(false);
  });
});

describe('describeJoinStatus — saved tables', () => {
  const NOW = 1_800_000_000_000;
  const saved: SessionPeekResponse = {
    exists: true,
    saved: true,
    playerCount: 0,
    hostName: 'Alice',
    takenColors: [],
    lastActiveAt: NOW - 2 * 24 * 60 * 60 * 1000,
  };

  it('offers its host to reopen it, from either tab', () => {
    for (const mode of ['join', 'host'] as const) {
      expect(describeJoinStatus(mode, 'CRYPT', saved, true, NOW)).toEqual({
        message: 'Your saved table · last played 2 days ago — it reopens just as you left it.',
        tone: 'ok',
        blocked: false,
        present: [],
      });
    }
  });

  it('tells everyone else it waits for its host', () => {
    expect(describeJoinStatus('join', 'CRYPT', saved, false, NOW)).toMatchObject({
      message: 'This table is saved · last played 2 days ago — waiting for Alice to reopen it.',
      tone: 'warn',
      blocked: true,
    });
  });

  it('keeps a new host from taking a saved table’s code', () => {
    expect(describeJoinStatus('host', 'CRYPT', saved, false, NOW)).toMatchObject({
      message: 'That code belongs to a saved table — pick another.',
      blocked: true,
    });
  });
});

describe('lastPlayed', () => {
  const NOW = 1_800_000_000_000;
  const MINUTE = 60_000;
  it('says how long ago, in words', () => {
    expect(lastPlayed(NOW - 20_000, NOW)).toBe('just now');
    expect(lastPlayed(NOW - MINUTE, NOW)).toBe('1 minute ago');
    expect(lastPlayed(NOW - 45 * MINUTE, NOW)).toBe('45 minutes ago');
    expect(lastPlayed(NOW - 3 * 60 * MINUTE, NOW)).toBe('3 hours ago');
    expect(lastPlayed(NOW - 30 * 60 * MINUTE, NOW)).toBe('yesterday');
    expect(lastPlayed(NOW - 6 * 24 * 60 * MINUTE, NOW)).toBe('6 days ago');
  });
});
