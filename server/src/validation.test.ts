import { describe, expect, it } from 'vitest';
import {
  parseSessionJoinRequest,
  parseSessionLeaveRequest,
  parsePlayerMoveRequest,
} from './validation.js';

describe('parseSessionJoinRequest', () => {
  it('accepts a well-formed payload and trims whitespace', () => {
    const result = parseSessionJoinRequest({
      sessionId: ' abc ',
      playerId: ' p1 ',
      playerName: ' Alice ',
    });
    expect(result).toEqual({ sessionId: 'abc', playerId: 'p1', playerName: 'Alice' });
  });

  it.each([
    [null],
    [undefined],
    ['a string'],
    [42],
    [{}],
    [{ sessionId: 'abc', playerId: 'p1', playerName: '' }],
    [{ sessionId: '   ', playerId: 'p1', playerName: 'Alice' }],
    [{ sessionId: 'abc', playerId: 123, playerName: 'Alice' }],
    [{ sessionId: 'abc', playerName: 'Alice' }],
  ])('rejects malformed payload %#', (payload) => {
    expect(parseSessionJoinRequest(payload)).toBeNull();
  });
});

describe('parseSessionLeaveRequest', () => {
  it('accepts a well-formed payload and trims whitespace', () => {
    expect(parseSessionLeaveRequest({ sessionId: ' abc ', playerId: ' p1 ' })).toEqual({
      sessionId: 'abc',
      playerId: 'p1',
    });
  });

  it.each([
    [null],
    [{ sessionId: 'abc' }],
    [{ playerId: 'p1' }],
    [{ sessionId: '', playerId: 'p1' }],
  ])('rejects malformed payload %#', (payload) => {
    expect(parseSessionLeaveRequest(payload)).toBeNull();
  });
});

describe('parsePlayerMoveRequest', () => {
  it('accepts a well-formed payload and trims whitespace', () => {
    const result = parsePlayerMoveRequest({
      sessionId: ' abc ',
      playerId: ' p1 ',
      position: { x: 1, y: 1.7, z: -2 },
      rotationY: 3.14,
    });
    expect(result).toEqual({
      sessionId: 'abc',
      playerId: 'p1',
      position: { x: 1, y: 1.7, z: -2 },
      rotationY: 3.14,
    });
  });

  it.each([
    [null],
    [undefined],
    [{}],
    [{ sessionId: '', playerId: 'p1', position: { x: 0, y: 0, z: 0 }, rotationY: 0 }],
    [{ sessionId: 'abc', playerId: 'p1', position: { x: 0, y: 0 }, rotationY: 0 }],
    [{ sessionId: 'abc', playerId: 'p1', position: { x: 0, y: 0, z: 'nope' }, rotationY: 0 }],
    [{ sessionId: 'abc', playerId: 'p1', position: { x: 0, y: 0, z: 0 }, rotationY: 'nope' }],
    [{ sessionId: 'abc', playerId: 'p1', position: { x: 0, y: 0, z: 0 }, rotationY: NaN }],
    [{ sessionId: 'abc', playerId: 'p1', position: null, rotationY: 0 }],
  ])('rejects malformed payload %#', (payload) => {
    expect(parsePlayerMoveRequest(payload)).toBeNull();
  });
});
