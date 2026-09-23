# Roadmap

← [CLAUDE.md](../CLAUDE.md)

Milestones for building Custom Tabletop, in order. Each is meant to land as one or more feature branches, merged and tagged before moving to the next — a milestone is "done" when it's playable/testable end to end, not just compiling. Scope, order, and even milestone boundaries can shift as we learn more; update this file (and log why in [decisions.md](decisions.md)) when they do.

Reordered 2026-09-23 around the walkable-3D-room decision — see [engineering/architecture.md](engineering/architecture.md#extension-a-walkable-3d-room-not-a-2d-map-with-3d-accents). The room and first-person movement now come *before* the tabletop map/drawing feature, since the room is the primary view, not an overlay on top of a 2D map.

## M0 — Repository & workflow setup ✅

Version control, docs structure, and the Claude Code workflow.

## M1 — Toolchain & project scaffolding ✅

- Node.js 24 LTS installed.
- npm workspaces: `client/`, `server/`, `shared/`, each with its own `package.json` and `tsconfig.json`.
- `client`: Vite + React + TypeScript, connection-status page.
- `server`: Node + TypeScript + Express (REST health check) + Socket.IO.
- `shared`: the spec's `GameState`/`Scene`/`Player` types and event names, consumed as TS source directly by both (no build step) — plus an infra-only `connection:ping`/`connection:pong` pair for this milestone's exit check.
- ESLint (flat config) + Prettier across the workspace; Vitest wired up with a smoke test per package.
- **Exit check:** ✅ `server/src/server.test.ts` starts a real server, connects a real `socket.io-client`, and asserts a ping/pong round trip — verified to fail without the handler and pass with it. The client's connection-status page proves the same thing visually.

## M2 — Sessions & connection ✅

- `session:join` / `session:leave` (plus a new `session:state` broadcast — see `docs/decisions.md`), server-side session registry (`server/src/sessionStore.ts`).
- Host vs. player role, derived from `GameState.hostId` rather than stored per-player.
- Server-authoritative `GameState` shell, broadcast to a session's room on every membership change.
- Basic reconnect handling: a client identity (`playerId`) persisted in `sessionStorage` lets a dropped/reloaded tab rejoin as the same player, no duplicate.
- Client: a join screen (name + session code, or generate one to host) and a live player list, host labeled.
- **Exit check:** ✅ `server/src/session.test.ts` connects two real `socket.io-client`s, joins them to the same session, and asserts each sees the other in the resulting player list — verified to fail without the broadcast and pass with it. Manually smoke-tested against the real `npm run dev` process pair too.

## M3 — 3D room shell & first-person movement ✅

- **The real Blender-built room** (floor, walls, round table, bookshelf, window, rug — "cozy tabletop game room", 4-5 players) is exported as `.glb` (`client/public/models/room.glb`, source at `blender/room.blend`) and loaded via `GLTFLoader` through `RoomLoader.ts`'s `gltfUrl` option, now the default in `RoomView.tsx`. Dimensions match the placeholder layout exactly (10m×8m room, 3m walls, table radius 1.1m/height 0.75m), so no collision-code changes were needed. Scene lighting is set up client-side in Three.js (`RoomLighting.ts`), not baked into the glb — see `docs/decisions.md`. The procedural placeholder (`ProceduralRoom.ts`) remains as a fallback when `loadRoom()` is called with no `gltfUrl`, otherwise unused.
- First-person camera (`PointerLockControls`), WASD + mouse-look movement, collision against walls/table (`client/src/three/collision.ts`, `FirstPersonController.ts`) — **done**, unit-tested (13 tests, break-round verified against a fully-disabled passthrough).
- Solo exploration only — no other players visible yet, no map/dice. **Done**, matches scope.
- **Exit check:** a player joins a session and can walk around a 3D room and bump into the table/walls without clipping through them. **✅** — verified visually against the real Blender room via browser automation (geometry/materials/lighting render correctly); WASD movement itself rests on the unchanged, unit-tested collision suite rather than a fresh in-browser drive, since Chrome's Pointer Lock API rejects automated synthetic clicks (see `docs/decisions.md`).

## M4 — Player avatars

- `player:move` drives real 3D position/orientation, server-validated.
- Other connected players render and move as avatars in the room in real time (placeholder capsule/mesh is fine — real character models are a later art pass, not blocking).
- **Exit check:** two+ players in the same session see each other walk around the room live.

## M5 — Tabletop map & drawing

- `scene:create` / `scene:change` / `scene:update`, host-only, server-validated.
- The 2D canvas (background image + drawing) renders as a `THREE.CanvasTexture` applied to the table surface, not full-screen.
- Freehand drawing synced via `drawing:start` / `drawing:update` / `drawing:end` / `drawing:delete` — only the stroke delta goes over the wire.
- **Exit check:** host switches the map on the table and all players see it change; any player draws on the table and everyone sees the stroke live, from wherever they're standing in the room.

## M6 — Dice

- `dice:spawn` / `dice:roll` / `dice:remove`, server-authoritative.
- 3D dice rendered and animated on the table, visible to everyone in the room regardless of where they're standing/looking.
- **Exit check:** any player spawns and rolls a die on the table; the result and motion are visible to everyone.

## M7 — Soundboard & mute

- `sound:play` (host-triggered, or per scope decided at the time).
- `player:mute` / `player:unmute`.
- **Exit check:** host plays a sound, all players hear it; a muted player's state is visible to the group.

## M8 — Room interactables

- Additional 3D objects in the room beyond the table/dice that a player can approach and use (dice tray, shelf, etc.) — first real use of the "future 3D tabletop objects" bucket from the original spec.
- New event(s) (e.g. `object:interact`), server-validated same as everything else.
- **Exit check:** a player walks up to an interactable and triggers it; the effect is visible to everyone in the session.

## M9 — Host authority hardening

- Server-side validation for every host-gated action from the spec: scene create/change/delete, dice spawn/remove, player mute, player positions, join/leave, and any interactables added in M8 — a client can't do any of these by local manipulation alone.
- Cross-browser pass: Chrome, Edge, Firefox required; Safari best-effort.
- **Exit check:** a manually-forged client event for a host-only action is rejected by the server and has no effect.

## M10 — Performance & polish

- Confirm delta-only updates hold under real drawing/movement load (no full-state re-broadcast).
- Basic error/disconnect UX, session cleanup on empty session.
- Whatever's left from playtesting the milestones above.

---

Later, out of scope for now: persistence/save-load, richer map tools, mobile support, real (non-placeholder) character models — revisit once M1–M10 are playable.
