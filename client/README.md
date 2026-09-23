# client

React + TypeScript frontend (Vite). Scaffolded in Milestone 1 — see [../docs/roadmap.md](../docs/roadmap.md) and [../docs/engineering/tooling.md](../docs/engineering/tooling.md) for commands.

A connection-status header (M1's exit check), plus — as of Milestone 2 — a join screen (`JoinForm.tsx`: name + session code, or generate one to host) and a live player list (`SessionView.tsx`, host labeled). Player identity (`playerIdentity.ts`) persists in `sessionStorage`, not `localStorage`, so two tabs of the same browser stay distinct players — see `docs/decisions.md`. The room/canvas/three/dice/soundboard structure from [../docs/engineering/architecture.md](../docs/engineering/architecture.md) lands starting Milestone 3.
