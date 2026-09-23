# shared

TypeScript types and event contracts shared between `client` and `server`, so both use the same data models. Scaffolded in Milestone 1 — see [../docs/roadmap.md](../docs/roadmap.md).

`src/types.ts` (`GameState`, `Scene`, `Player`, plus placeholder shapes for `Character`/`Drawing`/`Dice`/`SoundState` pending the milestones that flesh them out) and `src/events.ts` (the spec's `SocketEvent` names, plus an infra-only `ConnectionEvent` ping/pong used by Milestone 1's exit check). Consumed as TypeScript source directly by both `client` (Vite) and `server` (`tsx`) — no build step.
