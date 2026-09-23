# Roadmap

← [CLAUDE.md](../CLAUDE.md)

Milestones for building Custom Tabletop, in order. Each is meant to land as one or more feature branches, merged and tagged before moving to the next — a milestone is "done" when it's playable/testable end to end, not just compiling. Scope, order, and even milestone boundaries can shift as we learn more; update this file (and log why in [decisions.md](decisions.md)) when they do.

## M0 — Repository & workflow setup ✅

Version control, docs structure, and the Claude Code workflow (this session). No application code.

## M1 — Toolchain & project scaffolding

- Install Node.js (LTS) on this machine.
- npm workspaces: `client/`, `server/`, `shared/`, each with its own `package.json` and `tsconfig.json`.
- `client`: Vite + React + TypeScript, empty app shell.
- `server`: Node + TypeScript + Express (REST) + Socket.IO, empty server that starts and accepts a connection.
- `shared`: TypeScript types/event contracts, imported by both (per the structure in [architecture.md](engineering/architecture.md)).
- ESLint + Prettier across the workspace; a test runner (Vitest) wired up with one smoke test per package.
- **Exit check:** client connects to server over a WebSocket, server logs the connection, one round-trip event works end to end.

## M2 — Sessions & connection

- `session:join` / `session:leave`, server-side session registry.
- Host vs. player role, assigned on join.
- Server-authoritative `GameState` shell (per the interfaces in [architecture.md](engineering/architecture.md)), broadcast to a session's clients on change.
- Basic reconnect handling (a dropped client can rejoin the same session).
- **Exit check:** two+ browser tabs join the same session and see each other in a player list.

## M3 — Scenes & 2D drawing

- `scene:create` / `scene:change` / `scene:update`, host-only, server-validated.
- 2D canvas layer renders the active scene's background image.
- Freehand drawing synced via `drawing:start` / `drawing:update` / `drawing:end` / `drawing:delete` — only the stroke delta goes over the wire, not the whole canvas (per the Performance section of [architecture.md](engineering/architecture.md)).
- **Exit check:** host switches scenes and all players see it change; any player draws and everyone sees the stroke live.

## M4 — 3D layer & player tokens

- WebGL/Three.js layer, rendered independently on top of the 2D/UI layers.
- Player tokens in 3D space, position synced via `player:move`, server-validated.
- **Exit check:** players see each other's tokens move in the 3D layer in real time, positioned correctly relative to the 2D scene underneath.

## M5 — Dice

- `dice:spawn` / `dice:roll` / `dice:remove`, server-authoritative.
- 3D dice rendered and animated in the WebGL layer, visible to all players in the session.
- **Exit check:** any player spawns and rolls a die; the result and motion are visible to everyone.

## M6 — Soundboard & mute

- `sound:play` (host-triggered, or per scope decided at the time).
- `player:mute` / `player:unmute`.
- **Exit check:** host plays a sound, all players hear it; a muted player's state is visible to the group.

## M7 — Host authority hardening

- Server-side validation for every host-gated action from the spec: scene create/change/delete, dice spawn/remove, player mute, player positions, join/leave — a client can't do any of these by local manipulation alone.
- Cross-browser pass: Chrome, Edge, Firefox required; Safari best-effort.
- **Exit check:** a manually-forged client event for a host-only action is rejected by the server and has no effect.

## M8 — Performance & polish

- Confirm delta-only updates hold under real drawing/movement load (no full-state re-broadcast).
- Basic error/disconnect UX, session cleanup on empty session.
- Whatever's left from playtesting the milestones above.

---

Later, out of scope for now: persistence/save-load, richer map tools, mobile support — revisit once M1–M8 are playable.
