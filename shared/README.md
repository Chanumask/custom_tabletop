# shared

TypeScript types and event contracts shared between `client` and `server`, so both use the same data models. Scaffolded in Milestone 1 — see [../docs/roadmap.md](../docs/roadmap.md).

`src/types.ts` (`GameState`, `Scene`, `Player`, plus placeholder shapes for `Character`/`Drawing`/`Dice`/`SoundState` pending the milestones that flesh them out), `src/events.ts` (the spec's `SocketEvent` names plus `SessionState`, and an infra-only `ConnectionEvent` ping/pong used by Milestone 1's exit check), and `src/session.ts` (the `session:join`/`session:leave` request/response payload shapes, added in Milestone 2 — the spec named the events but not their payloads). Consumed as TypeScript source directly by both `client` (Vite) and `server` (`tsx`) — no build step.
