import { describe, expect, it } from 'vitest';
import {
  SocketEvent,
  ConnectionEvent,
  PLAYER_COLORS,
  MAX_PLAYERS_PER_SESSION,
  isPlayerColorId,
  playerColorHex,
} from './index.js';

describe('shared/player colors', () => {
  it('offers six distinct colors, capping a session at six players', () => {
    expect(new Set(PLAYER_COLORS.map((color) => color.id)).size).toBe(6);
    expect(new Set(PLAYER_COLORS.map((color) => color.hex)).size).toBe(6);
    expect(MAX_PLAYERS_PER_SESSION).toBe(6);
  });

  it('recognizes only real color ids', () => {
    expect(isPlayerColorId('red')).toBe(true);
    expect(isPlayerColorId('magenta')).toBe(false);
    expect(isPlayerColorId(undefined)).toBe(false);
  });

  it('maps a color id to its hex value', () => {
    expect(playerColorHex('blue')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('shared/events', () => {
  it('exposes the spec event names as constants', () => {
    expect(SocketEvent.SessionJoin).toBe('session:join');
    expect(SocketEvent.DiceRoll).toBe('dice:roll');
  });

  it('exposes a connection round-trip pair distinct from domain events', () => {
    expect(ConnectionEvent.Ping).toBe('connection:ping');
    expect(ConnectionEvent.Pong).toBe('connection:pong');
  });

  it('exposes the session-state broadcast event added in Milestone 2', () => {
    expect(SocketEvent.SessionState).toBe('session:state');
  });
});
