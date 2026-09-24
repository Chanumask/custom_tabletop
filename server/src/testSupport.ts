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
