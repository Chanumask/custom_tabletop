# client

React + TypeScript frontend (Vite). Scaffolded in Milestone 1 — see [../docs/roadmap.md](../docs/roadmap.md) and [../docs/engineering/tooling.md](../docs/engineering/tooling.md) for commands.

Before joining: a connection-status header (M1) and a join screen (`JoinForm.tsx`: name + session code, or generate one to host). Player identity (`playerIdentity.ts`) persists in `sessionStorage`, not `localStorage`, so two tabs of the same browser stay distinct players — see `docs/decisions.md`.

After joining: a full-viewport first-person 3D room (`three/RoomView.tsx`) is the main view, with the session panel (code, player list, leave — `SessionView.tsx`) as a small fixed overlay. `three/`: `collision.ts` (pure, unit-tested wall/table collision resolution), `FirstPersonController.ts` (`PointerLockControls`-based WASD + mouse-look), `ProceduralRoom.ts` (the current placeholder room/table, built directly in Three.js — not yet the real Blender asset), `RoomLoader.ts` (the `GLTFLoader` seam that will load the real room once it exists, see `docs/engineering/blender-workflow.md`). The map/canvas/dice/soundboard pieces from [../docs/engineering/architecture.md](../docs/engineering/architecture.md) land starting Milestone 5.
