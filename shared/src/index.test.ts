import { describe, expect, it } from 'vitest';
import {
  SocketEvent,
  ConnectionEvent,
  PLAYER_COLORS,
  MAX_PLAYERS_PER_SESSION,
  isPlayerColorId,
  playerColorHex,
  spawnPointFor,
  DEFAULT_SPAWN_POSITION,
} from './index.js';

describe('shared/player colors', () => {
  it('offers eight distinct colors, capping a session at eight players', () => {
    expect(new Set(PLAYER_COLORS.map((color) => color.id)).size).toBe(8);
    expect(new Set(PLAYER_COLORS.map((color) => color.hex)).size).toBe(8);
    expect(MAX_PLAYERS_PER_SESSION).toBe(8);
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

describe('spawnPointFor', () => {
  it('gives every color its own spot, well apart, facing the table', () => {
    const spawns = PLAYER_COLORS.map((color) => spawnPointFor(color.id));
    for (const [i, a] of spawns.entries()) {
      for (const b of spawns.slice(i + 1)) {
        expect(
          Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z),
        ).toBeGreaterThan(0.9);
      }
      // Facing (sin, cos) of the heading points back at the table's center.
      const toCenter = Math.atan2(-a.position.x, -a.position.z);
      expect(a.rotationY).toBeCloseTo(toCenter, 9);
      expect(a.position.y).toBe(DEFAULT_SPAWN_POSITION.y);
    }
  });
});
