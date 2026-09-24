import { describe, expect, it } from 'vitest';
import type { SessionPeekResponse } from '@custom-tabletop/shared';
import { describeJoinStatus } from './joinStatus.js';

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
  takenColors: ['red', 'blue', 'green', 'yellow', 'purple', 'orange'].slice(
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
    expect(describeJoinStatus('join', 'ABCDE', table(6))).toMatchObject({
      message: 'That table is full (6 players).',
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
