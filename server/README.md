# server

Node.js + TypeScript backend (Express REST + Socket.IO). Scaffolded in Milestone 1 — see [../docs/roadmap.md](../docs/roadmap.md) and [../docs/engineering/tooling.md](../docs/engineering/tooling.md) for commands.

A health-check route, a `connection:ping`/`connection:pong` round trip (M1's exit check, `server.test.ts`), and — as of Milestone 2 — the session registry: `sessionStore.ts` (server-authoritative `GameState` per session, host-by-first-joiner, reconnect-safe joins) and `validation.ts` (runtime payload guards for `session:join`/`session:leave`), wired up in `server.ts` and proven in `session.test.ts`. The `scenes`/`players`/`game-state` structure from [../docs/engineering/architecture.md](../docs/engineering/architecture.md) that's left (scenes, drawing, dice, sound) lands starting Milestone 3/5.
