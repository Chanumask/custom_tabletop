import { describe, expect, it } from 'vitest';
import { SocketEvent, ConnectionEvent } from './index.js';

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
