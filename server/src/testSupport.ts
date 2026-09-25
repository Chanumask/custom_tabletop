import type { Socket as ClientSocket } from 'socket.io-client';
import { SocketEvent, type GameState, type SessionPatch } from '@custom-tabletop/shared';

/**
 * Test-only helpers shared by the socket integration tests (not itself a
 * test file). session:join requires a per-tab secret `playerToken` (see
 * shared/src/session.ts); most socket tests are about other behavior, so
 * this fills one in, derived from the payload's playerId. Deterministic on
 * purpose: a test that rejoins with the same playerId presents the same
 * credential, exactly like a real reloaded tab would. Payloads that aren't
 * objects, or that already carry a token, pass through untouched so
 * malformed-payload tests still exercise what they mean to.
 */
export function withTestToken(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null || 'playerToken' in payload) {
    return payload;
  }
  const { playerId } = payload as { playerId?: unknown };
  return { ...payload, playerToken: `test-token-${String(playerId)}` };
}

/**
 * Follows a client's view of the session the way the real client does:
 * a full snapshot (session:state) replaces it, a patch (session:patch)
 * merges over it. `handler` sees the merged state after every update.
 * Returns the unsubscribe function.
 */
export function onStateUpdates(
  client: ClientSocket,
  handler: (state: GameState) => void,
): () => void {
  let merged = {} as GameState;
  const full = (state: GameState) => {
    merged = state;
    handler(merged);
  };
  const partial = (message: SessionPatch) => {
    merged = { ...merged, ...message.patch };
    handler(merged);
  };
  client.on(SocketEvent.SessionState, full);
  client.on(SocketEvent.SessionPatch, partial);
  return () => {
    client.off(SocketEvent.SessionState, full);
    client.off(SocketEvent.SessionPatch, partial);
  };
}

/** Resolves with the client's (merged) view once `predicate` holds. A
 * predicate reading a key that hasn't arrived yet counts as "not yet". */
export function waitForState(
  client: ClientSocket,
  predicate: (state: GameState) => boolean,
  timeoutMs = 2000,
): Promise<GameState> {
  return new Promise((resolve, reject) => {
    const stop = onStateUpdates(client, (state) => {
      let matched = false;
      try {
        matched = predicate(state);
      } catch {
        matched = false;
      }
      if (matched) {
        clearTimeout(timer);
        stop();
        resolve(state);
      }
    });
    const timer = setTimeout(() => {
      stop();
      reject(new Error('timed out waiting for a matching session update'));
    }, timeoutMs);
  });
}

/** Resolves with the next update the client sees (full or patch). */
export function nextUpdate(client: ClientSocket): Promise<GameState> {
  return waitForState(client, () => true);
}
