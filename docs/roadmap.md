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

## M9 — Host authority hardening ✅

- An audit pass, not a new feature — every action host-gated server-side already had its check from the milestone that introduced it; this milestone proved the coverage rather than adding it. **The original spec's "needs validation" list (dice spawn/remove, player positions, join/leave) is *not* the same as "is host-gated"** — those three are deliberately open to any player (M4/M6 decisions) and only need malformed-payload rejection, which they already had. The actually host-gated set, confirmed complete: `scene:create`, `scene:change`, `scene:update`, `sound:play`, `player:mute`/`player:unmute` (of another player — self-mute is open).
- Two real gaps closed: `scene:create` and `scene:change` had no live socket-level test proving a forged non-host request is rejected (only `scene:update` and `sound:play`/`player:mute` did); `player:unmute` had no test coverage at all. All closed in `server/src/hostAuthority.test.ts`. A minor related gap (no socket-level malformed-`drawing:start` test, unlike every other event family) closed alongside it.
- Cross-browser pass: Chrome, Edge, Firefox required; Safari best-effort. **Not performed** — this environment's browser automation tooling drives Chrome only. Logged as an accepted, unverified gap rather than skipped silently; see `docs/decisions.md`.
- **Exit check:** a manually-forged client event for a host-only action is rejected by the server and has no effect. **✅ (server-side)** — proven by `server/src/hostAuthority.test.ts`, break-round verified. Cross-browser rendering/input behavior is unverified, per above.

## Session menu & settings extension ✅

A user-requested UI/UX pass, not itself a numbered milestone — landed between M9 and M10. See `docs/decisions.md` (2026-09-24) and `docs/changelog.md` for the full breakdown.

- The top-right session menu restructured into categorized tabs (Players/Map/Dice/Sound/Settings), one open at a time, with icons and centered/consistent styling.
- Client-only settings (`localStorage`, never synced to `GameState`): master volume, and a rebindable interact key (previously hardcoded to `E`).
- Any player can add a sound to the shared soundboard via a direct audio-file link, not just upload — a YouTube-audio-download mechanism was explicitly declined (ToS/copyright) in favor of this.

## Wall soundboard extension ✅

A further user-requested rework of the M8 soundboard interactable, landed right after the session-menu extension above. See `docs/decisions.md` (2026-09-24) and `docs/changelog.md` for the full breakdown.

- Replaced the M8 floor-standing console with a wall-mounted 4x4 grid of individually-addressable buttons (`GameState.soundboardSlots`), each independently empty or holding a specific sound.
- Interaction switched from click to aim + E (a proximity-only model can't tell 16 wall-mounted buttons apart); pressing an empty button opens an in-room menu to attach a sound via link or upload.
- `sound:play` was relaxed from host-only to open to any player, applied consistently to both the wall board and the 2D panel.
- Live-verified on 2026-09-25: the board renders on the east wall, aim + E plays, and one press played the sound exactly once in each of three players' tabs.

## Follow-up change requests & extras (2026-09-24/25) ✅

The seven change requests from the owner's follow-up prompt, plus extras aimed at "not feeling limited". Each has a decisions.md entry; the changelog (2026-09-25) lists the commits.

- **Foundations:** socket identity binding, presence with a reconnect grace period, host handover; six unique player colors with a pre-join peek, live profile edits, invite links.
- **CR #1 Soundboard links:** YouTube plays as a visible embedded clip (audio-only isn't allowed); direct audio links are validated; the board can be managed.
- **CR #2 Table & map:** square table, true-color surface, a crop/preview dialog that keeps the aspect ratio.
- **CR #3 Characters:** six animated Quaternius characters (shirt in the player color), smooth movement, sitting on chairs, emotes, name tags.
- **CR #4 Room:** a fully furnished Blender room; gameplay geometry (colliders, seats, table, whiteboard) read from the model.
- **CR #5 Whiteboard:** six synced lines in their writers' colors, collision-free per-line edits.
- **CR #6 Join screen:** live character preview, branded card, invite-link paste, who's-at-the-table status.
- **CR #7 Sync:** a four-player end-to-end socket test asserting every client converges to the same game.
- **Extras:** real d4–d20 dice landing on the server's result; chat and a session log with `/roll` and speech bubbles; right-click pings; a host-set map grid; per-color spawn points.

## M10 — Performance & polish ✅

Done 2026-09-25 (changelog: "The plan: seated look-around, the cozy room and TV, M10, cross-browser tests, a polish pass").

- **Delta-only updates hold under load.** `session:patch` sends only the changed keys; full snapshots go only to joins and scene changes. `npm run load-test` (six players moving, drawing, rolling and chatting) measured ~13 KB/s per player (was ~29) and a biggest message of 8.9 KB (was 51 KB and growing), with ~1 ms acks.
- **Code-split.** The join screen's bundle went from 992 KB to 211 KB (69 KB gzipped). The room's code and model preload behind the join form, with a progress card if they haven't arrived yet.
- **Error/disconnect UX:** a reconnect banner and grace period, toasts for refused actions, and deletion of empty sessions (done along the way).
- **Milestone 9's cross-browser pass.** `npm run test:e2e` runs Playwright smoke tests in Chromium, Firefox and WebKit, and in Edge on demand. It found and fixed a WebKit audio crash and a WebKit TV layer that can't composite (that TV now falls back to the corner player).
- **Polish from a full visual and functional QA pass.** In-game controls in the join screen's palette, a collapsible menu, the parchment table, a highlight on the wall-board button you aim at, and clips that resume when moved. In the room: wall hotspots, the shield and the chandelier were fixed. It renders at 60 fps (1080p, 135 draw calls, ~160k triangles).

---

## Deployment (2026-09-25)

- ✅ Production build: the server serves the built client from one origin, the server is bundled with esbuild, and there's a Docker image.
- ✅ Upload safeguards for an open site: pruning, a 2 GB cap and a per-IP rate limit.
- ✅ Deployed to the owner's VPS as a sandboxed compose project (`/srv/apps/tabletop`, `murrinet`), with `npm run deploy` for updates.
- ✅ The Nginx Proxy Manager proxy host for `tabletop.murri.me` (created by the owner). The live site passes all 9 cross-browser smoke runs.

Details: [engineering/deployment.md](engineering/deployment.md).

---

## Saved tables (2026-09-25) ✅

Discussed and agreed with the owner, then built:
- Tables survive restarts and deploys; players reconnect into them.
- A table everyone has left waits 7 days, and hosting the same code reopens it for its host (their browser, or the secret host link).
- Player tokens are stored only as hashes, the saved tables' uploads are protected, and there's a cap.

Details: [decisions.md](decisions.md) "Saved tables", [engineering/deployment.md](engineering/deployment.md).

---

Later — **in discussion, not decided.** Each of these is an idea on the table, not a plan: talk it through with the user and get an explicit go-ahead (and a shape) before building any of it. Nothing here should be picked up "because it's next" (user, 2026-09-25).

- **Map presets**: a handful of built-in map backgrounds to pick from, mirroring the soundboard's presets. 2026-09-24 user request. (The crop/zoom/pan fit it came with landed on 2026-09-25 as the map crop dialog.)
- **Wall drawing + a pen tool**: extend drawing (Milestone 5) from the table to the room's walls, with a real tool-selection UI. 2026-09-24 user request.
- **Dev-tooling upgrades**: `npm audit` flags 5 vulnerabilities, all in dev-only tooling (Vite/esbuild/Vitest). The production dependency tree has 0 (`npm audit --omit=dev`), and the deployed app never runs the Vite dev server. Fixing them means major upgrades (`vite@8`, `vitest@5`), so it's a maintenance chore, not a deploy blocker.
- **Tokens/minis on the table**: small figures players drag around the map (suggested 2026-09-25).
- **Fog of war**: the host hides parts of the map and reveals them as players explore (suggested 2026-09-25).
- **Initiative tracker**: turn order shown in the room (suggested 2026-09-25).
- **macOS Safari check of the TV**: Windows WebKit falls back to the corner player; real Safari hasn't been tried.
- Mobile support.
