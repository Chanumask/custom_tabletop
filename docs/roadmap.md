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

## M4 — Player avatars ✅

- `player:move` drives real 3D position/orientation (yaw only — see `docs/decisions.md`), server-validated (`server/src/validation.ts`'s `parsePlayerMoveRequest`), applied via `SessionStore.move()` and rebroadcast as a delta to everyone else in the session — no ack, no full-state broadcast.
- Other connected players render and move as avatars in the room in real time — placeholder colored capsule meshes (`client/src/three/PlayerAvatars.ts`), not real character models (a later art pass, not blocking).
- **Exit check:** two+ players in the same session see each other walk around the room live. **✅** — proven by `server/src/playerMove.test.ts` (two real sockets, break-round verified) and `client/src/three/PlayerAvatars.test.ts`; a live two-browser-tab check confirmed the join/render pipeline works with no console errors, though driving WASD itself through the automated browser to see a *moving* remote avatar end-to-end wasn't possible (Chrome blocks the automation tool's synthetic Pointer Lock clicks — same gap as M3).

## M5 — Tabletop map & drawing ✅

- `scene:create` / `scene:change` / `scene:update`, host-only, server-validated — **implemented and unit-tested**; only `scene:update` is wired to UI so far (a scope cut agreed with the user, see `docs/decisions.md` — every session seeds one default scene, and the host retargets its background image rather than managing multiple named scenes).
- The 2D canvas (background image + drawing) renders as a `THREE.CanvasTexture` applied to the table surface, not full-screen — **done** (`client/src/three/TableCanvas.ts`), including a runtime UV remap (`tableTopUV.ts`) since Blender's default cylinder unwrap doesn't give the top face a clean 0..1 square.
- Freehand drawing synced via `drawing:start` / `drawing:update` / `drawing:end` / `drawing:delete` — only the stroke delta goes over the wire. **Done**, drawn by raycasting pointer input against the table mesh while not pointer-locked (`TableDrawing.ts`) — a deliberate "physical surface" interaction model, agreed with the user, not a flat 2D overlay.
- **Exit check:** host switches the map on the table and all players see it change; any player draws on the table and everyone sees the stroke live, from wherever they're standing in the room. **✅** — proven by `server/src/tabletopMap.test.ts` (break-round verified) and confirmed live in a real two-tab browser check (host's background swap and a non-host's drawn stroke each appeared on the other tab with no refresh).

## M6 — Dice ✅

- `dice:spawn` / `dice:roll` / `dice:remove`, server-authoritative — not host-gated, any player can do all three. The roll result is decided with `Math.random()` server-side (`SessionStore.rollDice`), never trusted from the client.
- 3D dice rendered and animated on the table, visible to everyone in the room regardless of where they're standing/looking — a spinning placeholder cube (`client/src/three/DiceManager.ts`) plus a camera-facing sprite label showing the current result, deliberately decoupled from the cube's own rotation (see `docs/decisions.md` for why).
- **Exit check:** any player spawns and rolls a die on the table; the result and motion are visible to everyone. **✅** — proven by `server/src/dice.test.ts` (break-round verified, including a non-owner/non-host roll and remove) and confirmed live in a real two-tab browser check (a second, non-host player's re-roll appeared on both tabs simultaneously with no refresh).

## M7 — Soundboard & mute ✅

- `sound:play` (host-triggered — the roadmap's own default scope, kept as-is).
- `player:mute` / `player:unmute` — not purely host-gated: a player can always mute/unmute themselves, and the host can additionally mute/unmute anyone (see `docs/decisions.md`). `muted` is a visible status flag only; this app has no voice chat to actually silence.
- **Exit check:** host plays a sound, all players hear it; a muted player's state is visible to the group. **✅** — proven by `server/src/soundAndMute.test.ts` (break-round verified) and confirmed live in a real two-tab browser check (a self-mute and a host-initiated unmute of another player each appeared on both tabs with no refresh). Sounds are synthesized Web Audio tones (a small fixed catalog), not shipped audio files — no real sound assets exist in this project.

## M8 — Room interactables ✅

- Three interactables, scoped live with the user beyond the roadmap's original placeholder (see `docs/decisions.md`): a light switch (a walk-up-to lamp prop, toggles the room's ambient lighting for everyone), the table's sit-down mode (a camera takeover to a full-screen, square, top-down table view, freeing up direct interaction with dice/drawing without walking around), and a physical soundboard console (large clickable buttons, reusing `sound:play` entirely).
- One generic `object:interact` event (`shared/src/interactables.ts`), server-validated same as everything else — the exact event name `docs/engineering/architecture.md` originally suggested.
- Trigger model: proximity + the E key (a player-chosen alternative to raycast/click), except the soundboard console's individual buttons, which are click-based like table drawing since a single keypress can't disambiguate which button.
- The seated table view also carries a small drawing toolbar — pen color/size and an eraser (`client/src/three/eraser.ts`, reusing the `drawing:delete` event from Milestone 5) — a follow-up user request once the sit-down mode existed. `Drawing` gained per-stroke `color`/`width`.
- **Exit check:** a player walks up to an interactable and triggers it; the effect is visible to everyone in the session. **✅** — proven by `server/src/interactables.test.ts` (break-round verified) and confirmed live in a real two-tab browser check (light toggle and seated-avatar squash both visible on the other tab; soundboard console buttons correctly gated to the host, same as the 2D panel; the drawing toolbar's color and eraser verified against the table's raw canvas pixel data) — including catching and fixing two real bugs live (a prompt-text update bug and a latent `drawing:delete` remote-redraw bug), see `docs/decisions.md`.

## M9 — Host authority hardening

- Server-side validation for every host-gated action from the spec: scene create/change/delete, dice spawn/remove, player mute, player positions, join/leave, and any interactables added in M8 — a client can't do any of these by local manipulation alone.
- Cross-browser pass: Chrome, Edge, Firefox required; Safari best-effort.
- **Exit check:** a manually-forged client event for a host-only action is rejected by the server and has no effect.

## M10 — Performance & polish

- Confirm delta-only updates hold under real drawing/movement load (no full-state re-broadcast).
- Basic error/disconnect UX, session cleanup on empty session.
- Whatever's left from playtesting the milestones above.

---

Later, out of scope for now (revisit once M1–M10 are playable):

- **Map presets & fitting**: a handful of standard/built-in map backgrounds to choose from (mirroring the soundboard's built-in presets), plus an interactive resize/reposition step when a custom map image is uploaded so it's fitted to the circular table properly (crop/zoom/pan) rather than just auto-scaled to fill it. 2026-09-24 user request; a cheap non-interactive "cover" fit (preserve aspect ratio, crop to fill, no stretch) landed as part of the file-uploads extension's work as a stopgap — the interactive fit tool itself is still future work.
- **Wall drawing + a pen tool**: extend drawing (Milestone 5) from the table surface to the room's walls, with a real tool-selection UI (a pen tool, implying others like an eraser later) rather than the current single click-drag-anywhere-on-the-table gesture. 2026-09-24 user request.
- Persistence/save-load, mobile support, real (non-placeholder) character models.
