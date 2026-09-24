# Changelog

← [CLAUDE.md](../CLAUDE.md)

Dated log of what happened each session. Newest first.

---

## 2026-09-24 (Milestone 8) — Room interactables: sit down at a full-screen table with a drawing toolbar, flip the light switch, play sounds from a physical console

**Asked** (user): "continue" — picked up the file-uploads session's handover, starting Milestone 8. Two design questions asked and answered before implementation (`AskUserQuestion`): what the interactable(s) should be, and how a player triggers one. The user specified something bigger than the roadmap's one-line placeholder: the table switching between "wander the room" and "sit at the table" modes, a toggleable light, and — explicitly offered as optional, "cook something cool and funny up for this" — a physical soundboard console with large clickable buttons. All three landed. Trigger method: proximity + a keypress (E). A follow-up ask mid-session, after seeing the seated view working, added two refinements: the seated table view should be full-screen (square, not widescreen-cropped), and it needs a small drawing toolbar (pen color/size, an eraser) since that's the natural place to draw precisely. Also flagged: a light-toggle concern, re-verified live and confirmed already working correctly.

### What landed

- **`shared`**: `interactables.ts` (`ObjectInteractRequest`/`Response`) and `SocketEvent.ObjectInteract` — one generic event for every interactable, dispatched server-side by a string `objectId`, per `docs/engineering/architecture.md`'s own suggested naming. `Player` gained `seated: boolean`, `GameState` gained `lightOn: boolean`. `Drawing` gained `color`/`width` (chosen once per stroke, carried on `DrawingStartRequest`, validated server-side with a width bound).
- **`server`**: `SessionStore.toggleLight`/`toggleSeated` — neither host-gated (light affects everyone equally; a player can only ever toggle their *own* seated status); a single `object:interact` handler in `server.ts` dispatching on `objectId`, ack + full-state broadcast like `scene:*`/`dice:*`. `startDrawing` now stores each stroke's chosen color/width.
- **`client`**: `interaction.ts` (`nearestInteractable`, pure proximity math, unit-tested); `RoomLamp.ts` (a walk-up-to-able lamp prop whose bulb material brightens/dims with `GameState.lightOn`) and `RoomLighting.ts` extended with `setRoomLightsOn` (the room's ambient/point lights dim to near-dark, never fully black, when the light is off); `FirstPersonController` gained `sit()`/`stand()` — a pure camera takeover (position/orientation swap + releasing pointer lock, which for free disables WASD via the controller's existing `!isLocked` early-exit and immediately re-enables the already-existing raycast-driven table interactions); `PlayerAvatars` squashes a seated player's capsule to ~55% height, the visible-to-everyone signal for "seated"; `SoundboardConsole.ts` — a physical, clickable "jukebox" prop reusing `sound:play` entirely (presentation only, zero new server logic), buttons sized generously (`BUTTON_RADIUS = 0.16`) after live testing showed small buttons are a genuinely hard click target at in-room viewing distance. Sitting also now switches the viewport to a square frame (`RoomView.tsx`'s `applyViewportSize`) so the round table fills the screen properly, with `SEATED_HEIGHT_ABOVE_TABLE` retuned to match; a small `.drawing-toolbar` (pen color/size, an eraser) appears only while seated, driving `TableCanvas`'s now-per-stroke color/width and a new `eraser.ts`'s `findStrokeNear` hit-test that reuses the previously-unwired `drawing:delete` event. `RoomView.tsx` wires all of it together: an E-press proximity prompt (a new `.interaction-prompt` pill, `style.css`), gates `player:move` sends off entirely while seated (otherwise the camera's teleport to/from the top-down view would itself broadcast as a huge, wrong position jump), and reconciles a rejoin/reload against an already-seated `GameState.players` snapshot so a lingering seated flag (a disconnect doesn't clear it) doesn't desync the local camera from server state.
- Branch `feat/room-interactables`, squash-merged into local `main`. **Not pushed.**

### Checked

- **The M8 exit-check test** (`server/src/interactables.test.ts`, 4 tests): a fresh session starts with the light on and nobody seated; a light toggle by any player is seen live by another and can be toggled back; a player sitting only ever changes their *own* status, seen live by everyone, and can stand back up; an unrecognized `objectId`/malformed payload is rejected without crashing. Break-round verified on the broadcast.
- `client/src/three/interaction.test.ts` (5 tests) and `client/src/three/eraser.test.ts` (6 tests) cover the proximity and stroke-hit-test math in isolation. `client/src/three/PlayerAvatars.test.ts` extended (now 8 tests) — a seated avatar squashes, and `updateOne` is confirmed to always apply as standing (documenting why `RoomView.tsx` must never send `player:move` for a seated local player). Server-side drawing tests extended for the new `color`/`width` fields.
- Full `sanity-check` (lint/format/build/test, 208 tests across all 3 workspaces) clean, both mid-session and right before merge.
- **Real two-tab browser verification, working around the known Chrome pointer-lock automation restriction** (logged since Milestone 3) by directly driving the exposed camera object and dispatching real `KeyE`/click input: the light toggle visibly dimmed the room and the lamp prop, synced live on both tabs, and toggled back on correctly too; sitting switched to a correct top-down, table-filling square view and hid the normal movement prompt, with the seated player's avatar visibly squashed on the other tab; standing restored the original view exactly; the soundboard console's buttons correctly triggered `sound:play` for the host and were rejected server-side for a non-host (matching the 2D panel); the drawing toolbar's pen color and eraser were verified against the table's raw canvas pixel data (not just the lit 3D render, which desaturates colors — a known characteristic, not a bug), and erasing a stroke on one tab correctly removed it on the other tab's view too.
- **Caught and fixed three real bugs live**, not via code review: (1) the E-press prompt text failed to update between "sit at the table" and "stand up" because the change-detection check only compared the nearest interactable id (which stays `'table'` in both states) and missed that the `seated` flag it also depends on had changed; (2) `drawing:delete` (implemented since Milestone 5, never wired to any UI until the eraser) redrew a remote viewer's table from a stale local copy of the scene that still had the deleted stroke in it, since the event has no accompanying `session:state` to refresh that copy first; (3) reported by the user directly after a first testing pass ("could erase once but after that... broken") — the real cause was that *neither* local nor remote drawing handlers ever updated the local copy of the scene's drawings in real time as strokes were drawn, so the eraser usually couldn't find anything drawn in the current sitting at all, only strokes that predated it. Fixed and reverified: drew and immediately erased three fresh strokes in a row (all first-attempt hits), then repeated across two tabs (one drawing, the other erasing immediately). Full detail on all three, plus a React-controlled-input automation-testing gotcha hit along the way, in `docs/decisions.md`.
- Dev server processes confirmed stopped, ports 3001/5173 clear afterward.

### Next session

Milestone 8 is done — **M1–M8 all complete**, plus the file-uploads extension. M9 (host authority hardening) and M10 (performance & polish) are the two roadmap milestones left. Paste-to-start prompt:

> Start Milestone 9: host authority hardening. Server-side validation already exists for every host-gated action (added incrementally as each milestone landed) — this milestone is a dedicated audit/hardening pass, not new features: manually forge a client event for each host-only action (scene create/change/update, sound:play, player mute, and anything else host-gated) and confirm the server rejects it with no effect, plus a real cross-browser pass (Chrome, Edge, Firefox required; Safari best-effort). Exit check: a manually-forged client event for a host-only action is rejected by the server and has no effect.

- **Branch:** `main` — none open. `feat/room-interactables` merged and deleted.
- **State:** M1–M8 all done, plus the file-uploads extension. The room now has a light switch, a sit-down table mode (full-screen square view, a pen/eraser drawing toolbar), and a physical soundboard console on top of everything from M1–M7.
- **Do next:** Milestone 9 per [docs/roadmap.md](roadmap.md), then Milestone 10. Both are audit/polish passes over what already exists rather than new features, so they're lighter than a typical milestone — could reasonably be combined into one session.
- **Watch for:** Chrome's Pointer Lock automation restriction can be worked around for keyboard-triggered (not click-to-lock-requiring) interactions by directly driving `camera.position` through a temporary debug hook and dispatching a real `computer` `key` action — documented in this session's approach, useful if another movement-dependent feature needs live verification. The PATH-after-install gotcha (`docs/engineering/tooling.md`) for `npm`/`node` in fresh Bash/PowerShell tool shells on this machine. Automated browser clicks need real page coordinates, not the (possibly downscaled) screenshot's own pixel dimensions — the `computer` tool documents this but it's easy to eyeball wrong; when precision matters, verify against `element.getBoundingClientRect()`/a `Vector3.project(camera)` computation rather than a screenshot ruler.
- **Environment:** nothing running — no dev server. Both ports confirmed clear at session end.

---

## 2026-09-24 (M5/M7 extension) — File uploads: players upload sounds to the shared soundboard, the host uploads a map image

**Asked** (user): "continue with m8. i want to be able for the players to upload sounds for a shared soundboard and i want the map/background of the tabe to be changeable by file upload or link" — plus a mid-turn follow-up describing four related future ideas (standard map presets, wall drawing + a pen tool, a full-screen "sit down" tabletop mode, and interactive map resize/fit), asking them captured in the roadmap if not already there.

### What landed

- **`server`**: `uploads.ts` — REST routes (`POST /uploads/images`, `POST /uploads/sounds`) via `multer` disk storage under `server/uploads/{images,sounds}/` (gitignored), with mimetype allowlists and size caps (10MB/8MB), served back via `express.static`. `SessionStore.hasSound`/`addSound`; a new `sound:upload` socket handler (open to any player, not host-gated) that registers an uploaded file's URL into `GameState.soundboard`; `sound:play` now rejects an unrecognized `soundId`.
- **`shared`**: `SoundState` gained a `url` field (`''` = built-in synthesized preset, set = uploaded file URL) and a new `BUILTIN_SOUND_PRESETS` constant the server seeds every session's soundboard with; `sound.ts` gained `SoundUploadRequest`/`Response`.
- **`client`**: `uploads.ts` (`uploadImage`/`uploadSound`, `fetch` + `FormData` against the new REST routes); `sounds.ts` rewritten around a `playSound(entry: SoundState)` API that plays a built-in tone or an uploaded file depending on `entry.url`; `SessionView.tsx` gained a map-image file input alongside the existing URL field, and the soundboard section now renders from live `GameState.soundboard` (not a static catalog) with an always-visible upload input; `App.tsx`'s `SoundPlay` listener now looks up the played sound from live state (via a `gameStateRef`) instead of a hardcoded preset id, and a new `handleUploadSound` wires the upload-then-register flow. `TableCanvas.ts` + new `imageFit.ts` (`computeCoverRect`) replaced straight image-stretch with an aspect-preserving "cover" crop, as a partial answer to the mid-turn map-fit ask.
- `docs/roadmap.md`'s "Later, out of scope for now" section expanded with the three other mid-turn asks (map presets, wall drawing/pen tool, tabletop "sit down" mode), each with the date and reasoning for deferring.
- Branch `feat/file-uploads`, squash-merged into local `main`. **Not pushed.**

### Checked

- `server/src/uploads.test.ts` (5 tests, real `fetch`/`FormData`/`Blob`): valid image/sound upload+serve, rejected mimetype (both kinds), oversized file rejected.
- `server/src/soundAndMute.test.ts` extended to 9 tests: a fresh session has the built-in presets; a non-host's uploaded sound is added to the shared soundboard, seen live by everyone, and playable by the host afterward; `sound:play` rejects an unknown id; `sound:upload` rejects a duplicate id. Break-round done on the new `sound:upload` broadcast.
- `client/src/three/imageFit.test.ts` (4 tests) covers the cover-fit crop math in isolation.
- Full `sanity-check` (lint/format/build/test, 189 tests across all 3 workspaces) clean, both mid-session and right before merge.
- **Real two-tab browser verification**: a non-host player uploaded a sound file — it appeared live in both tabs' soundboard list, Play button visible only on the host's tab; the host played both the upload and a built-in preset with no console errors on either tab; the host uploaded a map image — the table's texture visibly changed in sync on both tabs (POST and the subsequent image GET both 200), including for the second tab rejoining fresh afterward (its initial state already carried the uploaded background). No console errors anywhere in the flow.
- Dev server processes confirmed stopped, ports 3001/5173 clear afterward.

### Next session

This extension is done; Milestone 8 itself (room interactables) is still owed from the original "continue with m8" ask. Paste-to-start prompt:

> Start Milestone 8: room interactables. Additional 3D objects in the room beyond the table/dice that a player can approach and use (dice tray, shelf, etc.) — the first real use of the "future 3D tabletop objects" bucket from the original spec. New event(s) (e.g. `object:interact`), server-validated same as everything else. Exit check: a player walks up to an interactable and triggers it; the effect is visible to everyone in the session.

- **Branch:** `main` — none open. `feat/file-uploads` merged and deleted.
- **State:** M1–M7 all done, plus this file-uploads extension on top of M5/M7. The soundboard and map background are now backed by real uploads, not just built-ins/links.
- **Do next:** Milestone 8 per [docs/roadmap.md](roadmap.md) — likely needs a proximity/interaction-range check (how close counts as "approaching" an interactable), a design call worth flagging to the user rather than assuming.
- **Watch for:** four related-but-bigger asks are now logged in `docs/roadmap.md`'s "Later" section (map presets, wall drawing/pen tool, tabletop "sit down" mode, full interactive map resize/fit) — don't assume any of them are in scope for M8 just because they were mentioned in the same conversation. The Chrome Pointer Lock automation restriction (M3+) and the Blender MCP concurrent-session gotcha (M3 part 2) if either comes up again. The PATH-after-install gotcha (`docs/engineering/tooling.md`) for `npm`/`node` in fresh Bash/PowerShell tool shells on this machine.
- **Environment:** the client dev server (started this session for browser verification) should be stopped before ending — confirm ports 3001/5173 are clear.

---

## 2026-09-24 (Milestone 7) — Soundboard & mute: the host plays a sound everyone hears, a player's mute status is visible to the group

**Asked** (user): "next milestones" — after Milestone 6 finished (dice), picked up Milestone 7 per `docs/roadmap.md`.

### What landed

- **`shared`**: `sound.ts` (`SoundPlayRequest`/`Response`, `PlayerMuteRequest`/`Response`, `PlayerUnmuteRequest`/`Response`) — `Player.muted` and `GameState.soundboard` were already in the shared types since Milestone 1's placeholders, unused until now.
- **`server`**: `SessionStore.isHost` (a small reusable host check) and `SessionStore.setMuted` (self-service mute always allowed, host can additionally mute/unmute anyone); `sound:play`/`player:mute`/`player:unmute` socket handlers in `server.ts`. `sound:play` is host-only and broadcasts to the whole room *including the sender* (`io.to`, not `socket.to`) since there's no local-prediction reason to exclude them the way `player:move`/`drawing:*` do.
- **`client`**: `sounds.ts` — a small fixed soundboard catalog (Bell/Drum/Alert) synthesized with the Web Audio API (`OscillatorNode`) rather than shipped as audio files, since no real sound assets exist in this project; a single lazily-created, reused `AudioContext` handles the browser autoplay policy. `SessionView.tsx` gained a host-only Soundboard panel, a Mute/Unmute button per player (shown for yourself always, for others only if you're the host), and a "(muted)" tag in the player list.
- Branch `feat/soundboard-mute`, squash-merged into local `main`. **Not pushed.**

### Checked

- **The M7 exit-check test** (`server/src/soundAndMute.test.ts`, 5 tests): a host-played sound is received by every client including the host itself; a non-host is rejected; a self-mute and a host-initiated mute of another player are each seen live by everyone; a non-host is rejected from muting someone else while the host succeeds; malformed payloads don't crash the server. Break-round verified on both the sound and mute broadcasts separately.
- **Caught and fixed a real test-timing bug while writing the mute break-round** (not a server bug): a `.once()` session:state listener registered right after two `session:join` calls could catch an already-in-flight "player joined" broadcast instead of the later mute broadcast. Fixed with a short drain delay before registering the listener — logged in `docs/decisions.md` as a pattern to reuse if it recurs.
- `client/src/sounds.test.ts` covers the catalog shape and the unknown-id no-op path; actual tone playback (real `AudioContext`, unavailable under Vitest's `node` environment) is covered by the browser check below instead.
- Full `sanity-check` (lint/format/build/test, 180 tests across all 3 workspaces) clean, both mid-session and right before merge.
- **Real two-tab browser verification**: a non-host player's UI correctly hides the Soundboard/Map panels (host-only) while still showing a self-Mute button and the Dice panel; the host playing a sound produced no console errors on either tab; a self-mute and a host-initiated unmute of another player each appeared live on both tabs with no refresh.
- Dev server processes confirmed stopped, ports 3001/5173 clear afterward.

### Next session

Milestone 7 is done. Paste-to-start prompt:

> Start Milestone 8: room interactables. Additional 3D objects in the room beyond the table/dice that a player can approach and use (dice tray, shelf, etc.) — the first real use of the "future 3D tabletop objects" bucket from the original spec. New event(s) (e.g. `object:interact`), server-validated same as everything else. Exit check: a player walks up to an interactable and triggers it; the effect is visible to everyone in the session.

- **Branch:** `main` — none open. `feat/soundboard-mute` merged and deleted.
- **State:** M1–M7 all done. The room now has a full tabletop toolset (map, drawing, dice, soundboard, mute status) on top of the walkable 3D room and player avatars from earlier milestones.
- **Do next:** Milestone 8 per [docs/roadmap.md](roadmap.md) — likely needs a proximity/interaction-range check (how close counts as "approaching" an interactable), a design call worth flagging to the user rather than assuming.
- **Watch for:** the Chrome Pointer Lock automation restriction (M3+) and the Blender MCP concurrent-session gotcha (M3 part 2) if either comes up again. The PATH-after-install gotcha (`docs/engineering/tooling.md`) for `npm`/`node` in fresh Bash/PowerShell tool shells on this machine. The `.once()`-can-catch-a-stale-broadcast test-timing gotcha (this session, `docs/decisions.md`) if a new integration test needs to wait for a *specific* session:state broadcast following other recent ones.
- **Environment:** nothing running — no dev server. Both ports confirmed clear at session end.

---

## 2026-09-24 (Milestone 6) — Dice: any player spawns and rolls a die, the result is visible to everyone live

**Asked** (user): "next milestone" — after Milestone 5 finished (tabletop map & drawing), picked up Milestone 6 per `docs/roadmap.md`.

### What landed

- **`shared`**: `Dice` gained `position: Vector3` (the original spec never had one) and lost `sceneId` — a die is a physical object on the table itself, not part of the 2D map layer, so swapping the map shouldn't affect it (logged in `docs/decisions.md`). `dice.ts` (`DiceSpawnRequest`/`DiceRollRequest`/`DiceRemoveRequest`, ack'd + full-state-broadcast like `scene:*`).
- **`server`**: `SessionStore.spawnDice/rollDice/removeDice` — none host-gated (any player), the roll result decided by `Math.random()` server-side and never trusted from the client. Matching validators and `dice:*` socket handlers in `server.ts`. Renamed `SceneMutationResult` to the more accurate `GameStateMutationResult` since dice mutations now share the same ack+broadcast result shape.
- **`client`**: `DiceManager.ts` (a spinning-cube + camera-facing number-label sprite per die, membership and roll-detection both driven by one `sync()` since dice changes — unlike `player:move`/`drawing:*` — arrive via the same full-`GameState` channel as scenes); `diceSync.ts` (pure add/remove/rolled diffing, extracted for testability the same way `tableCoordinates.ts` was in Milestone 5); `diceSpawn.ts` (picks a random resting spot within the table's radius, client-side, sent as part of the spawn request — mirrors `player:move`'s trust boundary, since the server has no room-geometry knowledge by design). `SessionView.tsx` gained a "Dice" section (spawn button + a Roll/Remove per die), available to every player, not just the host. `RoomView.tsx` wires `DiceManager` into the room-load/animate-loop/cleanup lifecycle alongside `PlayerAvatars`/`TableCanvas`.
- Branch `feat/dice`, squash-merged into local `main`. **Not pushed.**

### Checked

- **The M6 exit-check test** (`server/src/dice.test.ts`, 4 tests): a spawn and a roll are each seen live by another player; a die spawned by one player can be rolled/removed by a *different* player (confirms it's genuinely not owner/host-gated); a later joiner's initial state includes an already-rolled die; malformed payloads are rejected without crashing. Break-round verified: disabled the spawn broadcast, watched the "seen live" assertion time out and fail, restored it, watched it pass again.
- `client/src/three/diceSync.test.ts` (7 tests) and `client/src/diceSpawn.test.ts` (3 tests) cover the pure logic in isolation; `DiceManager` itself (real `HTMLCanvasElement`/`THREE.Sprite` APIs) isn't unit-testable under Vitest's `node` environment, same as `TableCanvas` in Milestone 5 — covered by the browser check below instead.
- Full `sanity-check` (lint/format/build/test, 154 tests across all 3 workspaces) clean, both mid-session and right before merge.
- **Real two-tab browser verification**: spawned a die (showed a "?" label), rolled it (resolved to a visible number, both tabs in sync), had the *second, non-host* player re-roll it live (both tabs updated to the new result simultaneously with no refresh), then removed it. No console errors on either tab.
- Dev server processes confirmed stopped, ports 3001/5173 clear afterward.

### Next session

Milestone 6 is done. Paste-to-start prompt:

> Start Milestone 7: soundboard & mute. `sound:play` (host-triggered, or per scope decided at the time) and `player:mute`/`player:unmute`. Exit check: host plays a sound, all players hear it; a muted player's state is visible to the group.

- **Branch:** `main` — none open. `feat/dice` merged and deleted.
- **State:** M1–M6 all done. Players can now spawn, roll, and remove 3D dice on the table, server-authoritative and visible to everyone live, alongside the room/avatars/map/drawing from earlier milestones.
- **Do next:** Milestone 7 per [docs/roadmap.md](roadmap.md) — first milestone touching audio.
- **Watch for:** the Chrome Pointer Lock automation restriction (M3+) and the Blender MCP concurrent-session gotcha (M3 part 2) if either comes up again. The PATH-after-install gotcha (`docs/engineering/tooling.md`) for `npm`/`node` in fresh Bash/PowerShell tool shells on this machine. `scene:create`/`scene:change` are still implemented/tested but not wired to UI (M5 scope cut) — unrelated to M7 but still true.
- **Environment:** nothing running — no dev server. Both ports confirmed clear at session end.

---

## 2026-09-24 (Milestone 5) — Tabletop map & drawing: the host swaps the map, players draw on the physical table, everyone sees it live

**Asked** (user): "continue with the next milestones" — after Milestone 4 finished (player avatars), picked up Milestone 5 per `docs/roadmap.md`. Two scope questions asked and answered before implementation: drawing interaction model (raycast-on-the-table while pointer-lock is released, not a flat 2D overlay) and scene scope (one active scene per session with a swappable background URL, not a full multi-scene manager) — both logged in `docs/decisions.md`.

### What landed

- **`shared`**: new `Point2D` type (`Drawing.points` now uses it instead of the original spec's `Vector3[]` — a stroke lives on a flat canvas, not in 3D space); the redundant top-level `GameState.drawings` field (duplicate of `Scene.drawings`, never consumed) dropped; `scene.ts` (`SceneCreateRequest`/`SceneChangeRequest`/`SceneUpdateRequest`, ack'd + full-state-broadcast like `session:join`) and `drawing.ts` (`DrawingStartRequest`/`DrawingUpdateRequest`/`DrawingEndRequest`/`DrawingDeleteRequest`, fire-and-forget like `player:move`). Both spec deviations logged in `docs/decisions.md` and `docs/engineering/architecture.md` per that file's own "Changing this spec" instruction.
- **`server`**: every session now seeds one default scene at creation (`createDefaultScene`, mirroring M2's implicit-session-creation pattern); `SessionStore.createScene/changeScene/updateScene` (host-gated) and `startDrawing/appendDrawingPoint/deleteDrawing` (not host-gated — any player can draw); matching validators in `validation.ts`; `scene:*` and `drawing:*` socket handlers in `server.ts` following the two existing sync patterns (ack + full broadcast for the infrequent host-gated scene events, fire-and-forget delta rebroadcast for the frequent drawing events, same as `player:move`).
- **`client`**: `TableCanvas.ts` (an offscreen `<canvas>` → `THREE.CanvasTexture`, `flipY: false`, redraws the background + all accumulated strokes on scene change, extends a stroke incrementally on live drawing updates); `tableTopUV.ts` (recomputes the `Table_Top` mesh's UV from local X/Z at runtime, since Blender's default cylinder unwrap splits top/side/bottom into separate islands rather than one clean square); `tableCoordinates.ts` (the shared local-XZ-to-canvas-pixel formula both the UV remap and the raycast input use, so a stroke always lands exactly under the cursor); `TableDrawing.ts` (raycasts pointer input against the table mesh while not pointer-locked). `RoomView.tsx` wires all of it together plus `scene:*`/`drawing:*` socket listeners; `SessionView.tsx` gained a host-only "Map background URL" form. The "click to look around" prompt shrank from a full-screen button to a small bottom pill (`style.css`), freeing the rest of the viewport for direct table interaction.
- Branch `feat/tabletop-map-drawing`, squash-merged into local `main`. **Not pushed.**

### Checked

- **The M5 exit-check test** (`server/src/tabletopMap.test.ts`, 5 tests): a host's map switch is seen live by another player and rejected for a non-host; a drawing stroke is seen live point-by-point (not just at the end) by another player; a later joiner's initial state already contains a fully-drawn stroke; `drawing:delete` is seen live. Break-round verified on both halves (scene broadcast and drawing broadcast disabled separately, each confirmed to fail the matching assertion, then restored).
- `client/src/three/tableTopUV.test.ts` and `tableCoordinates.test.ts` cover the coordinate math powering both texture display and drawing input, in isolation.
- Full `sanity-check` (lint/format/build/test, 120 tests across all 3 workspaces) clean, both mid-session and right before merge.
- **Real two-tab browser verification**: drew directly on the table via click-drag (raycast hit exactly under the cursor); host set a background image and the second tab updated live with no refresh; the second (non-host) player's own drawn stroke appeared live on the host's tab, correctly layered over the background. Hit and worked around a real external-network/CORS restriction in the sandboxed test browser (a live Wikimedia image failed to load — confirmed via `fetch(...).ok === false`, not an app bug) by substituting a `data:` URI generated in-page, which loaded and displayed correctly.
- Dev server processes confirmed stopped, ports 3001/5173 clear afterward.

### Next session

Milestone 5 is done. Paste-to-start prompt:

> Start Milestone 6: dice. `dice:spawn`/`dice:roll`/`dice:remove`, server-authoritative; 3D dice rendered and animated on the table, visible to everyone in the room regardless of where they're standing/looking. Exit check: any player spawns and rolls a die on the table; the result and motion are visible to everyone.

- **Branch:** `main` — none open. `feat/tabletop-map-drawing` merged and deleted.
- **State:** M1–M5 all done. The table now carries a live, swappable map with real-time collaborative drawing, on top of M1–M4's toolchain/sessions/room/avatars.
- **Do next:** Milestone 6 per [docs/roadmap.md](roadmap.md).
- **Watch for:** `scene:create`/`scene:change` are implemented and unit-tested server-side but not wired to any UI yet (deliberate M5 scope cut, see `docs/decisions.md`) — a multi-scene/map-switcher UI is the natural place to finally exercise them, if that need comes up. The Chrome Pointer Lock automation restriction (M3/M4) and the Blender MCP concurrent-session gotcha (M3 part 2) still apply if either comes up again. The PATH-after-install gotcha (`docs/engineering/tooling.md`) for `npm`/`node` in fresh Bash/PowerShell tool shells on this machine.
- **Environment:** nothing running — no dev server. Both ports confirmed clear at session end.

---

## 2026-09-23 (Milestone 4) — Player avatars: two+ players see each other walk around the room live

**Asked** (user): "continue with the next milestones" — after Milestone 3 finished (real Blender room), picked up Milestone 4 per `docs/roadmap.md`: `player:move` driving real 3D position/orientation, server-validated, with other connected players rendered as placeholder avatars.

### What landed

- **`shared`**: `Player.rotationY` (yaw only, radians — see `docs/decisions.md` for why not full orientation); `PlayerMoveRequest` (`shared/src/player.ts`) for the `player:move` payload, used both directions (client → server send, server → other clients rebroadcast); `DEFAULT_SPAWN_POSITION`, a shared constant so the client's camera spawn point and the server's default `Player.position` can't drift apart.
- **`server`**: `parsePlayerMoveRequest` (shape/finite-number validation, `validation.ts`); `SessionStore.move()` (updates a player's position/rotation in place, no-ops for an unknown session/player); a `player:move` socket handler (`server.ts`) that validates, applies, and rebroadcasts to everyone else in the session (`socket.to(sessionId).emit`, excluding the sender) — no ack, no full-state broadcast, matching the spec's "deltas, not full state" performance guidance.
- **`client`**: `PlayerAvatars.ts` (placeholder capsule meshes, one per other connected player, colored deterministically per player id) with membership (`sync`, driven by `GameState.players`) and live movement (`updateOne`, driven by `player:move` broadcasts) deliberately kept as separate methods — see `docs/decisions.md`. `FirstPersonController.getYaw()` (derives yaw from the camera's world direction rather than reading `camera.rotation.y`, which is wrong once pitch is non-zero under `PointerLockControls`'s internal Euler order). `RoomView.tsx` now takes `socket`/`sessionId`/`playerId`/`players` props, throttles outgoing `player:move` sends to ~10Hz (only when position/yaw actually changed), and wires incoming broadcasts to `PlayerAvatars.updateOne`. `App.tsx` passes the new props through.
- Branch `feat/player-avatars`, squash-merged into local `main`. **Not pushed.**

### Checked

- **The M4 exit-check test** (`server/src/playerMove.test.ts`): two real `socket.io-client`s — one moves, the other receives the broadcast live, the mover does *not* receive their own echo; a later joiner's initial `session:state` reflects an already-moved player's position; a malformed move is dropped without crashing the server. Break-round verified: removed the rebroadcast, watched the "sees it live" assertion time out and fail, restored it, watched it pass again.
- `client/src/three/PlayerAvatars.test.ts` (6 tests): create/update/remove/dispose, all against real `THREE.Group`/`Mesh`/`Geometry` objects — no WebGL/DOM needed for that under Vitest's `node` environment.
- Full `sanity-check` (lint/format/build/test, 68 tests across all 3 workspaces) clean, both mid-session and right before merge.
- **Real browser verification** (two Chrome tabs via browser automation): both players joined the same session, saw each other in the player list, room rendered with no console errors. **Known gap, same limitation as Milestone 3:** couldn't drive WASD through the automated browser to visually confirm a *moving* remote avatar end-to-end — Chrome rejects the automation tool's synthetic clicks for Pointer Lock (confirmed directly: `document.pointerLockElement` stayed null after a synthetic click). The server integration test and client unit tests cover what the browser check couldn't reach.
- Dev server processes confirmed stopped, ports 3001/5173 clear afterward.

### Next session

Milestone 4 is done. Paste-to-start prompt:

> Start Milestone 5: tabletop map & drawing. `scene:create`/`scene:change`/`scene:update` (host-only, server-validated); the 2D canvas (background image + drawing) renders as a `THREE.CanvasTexture` applied to the table surface, not full-screen; freehand drawing synced via `drawing:start`/`drawing:update`/`drawing:end`/`drawing:delete`, stroke-delta-only over the wire. Exit check: host switches the map on the table and all players see it change; any player draws on the table and everyone sees the stroke live, from wherever they're standing in the room.

- **Branch:** `main` — none open. `feat/player-avatars` merged and deleted.
- **State:** M1–M4 all done. Players now see each other as colored capsule avatars walking around the real Blender room in real time.
- **Do next:** Milestone 5 per [docs/roadmap.md](roadmap.md) — first milestone touching the 2D canvas/drawing layer and the table's `CanvasTexture`.
- **Watch for:** the Chrome Pointer Lock automation restriction if UI-testing movement again in this environment — a real (non-automated) browser session doesn't hit it. The Blender MCP concurrent-session gotcha (`docs/decisions.md`, M3 part 2) if Blender work resumes for M5/table texture work. The PATH-after-install gotcha (`docs/engineering/tooling.md`) for `npm`/`node` in fresh Bash/PowerShell tool shells on this machine.
- **Environment:** nothing running — no dev server, no Blender instance. Both ports confirmed clear at session end.

---

## 2026-09-23 (Milestone 3, part 2) — Real Blender room built and swapped in; Milestone 3 done

**Asked** (user): the standing next-session prompt — finish Milestone 3 by building the real room in Blender via the now-loaded `blender` MCP tools, exporting to `.glb`, and swapping it in via `RoomLoader.ts`'s `gltfUrl` option, replacing the procedural placeholder.

### What landed

- **Confirmed the `blender` MCP tools loaded** this session (fresh session, per the M3-split reasoning from part 1). Blender wasn't yet running — launched it, confirmed the addon connects (`get_addon_status`), ran the per-session ritual (`disable_telemetry`).
- **Built the room directly in Blender via `execute_blender_code`** (Python, not the UI): floor, four walls, round table (top/pedestal/base), rug, bookshelf + book blockouts, window + frame — matching `PLACEHOLDER_ROOM_LAYOUT`'s dimensions exactly (10m×8m room, 3m walls, table radius 1.1m/height 0.75m), so it's a pure asset swap with zero changes to `collision.ts`/`RoomLayout.ts`. See `docs/decisions.md` for the full reasoning.
- **Caught and fixed a real scale bug before it ever reached the browser**: Blender's `primitive_*_add(size=1)` shapes have half-extent 0.5, so an initial `.scale = (desired/2, ...)` halved everything again. Caught via `get_object_info`'s `world_bounding_box` (floor came out 5×4, not 10×8) before exporting — fixed and reverified dimensions with the same tool.
- **Exported to `client/public/models/room.glb`**, saved the editable source separately at `blender/room.blend` (not a web asset, kept out of `client/public/`). Wired `RoomView.tsx` to `loadRoom({ gltfUrl: '/models/room.glb' })`, replacing the procedural placeholder as the default.
- **Lighting: baking it into the glb (`export_lights=True`) badly overexposed the browser render** — verified visually via real Chrome browser automation (floor blew out to flat white). Root cause: Blender's Watt→candela conversion plus Three's physically-correct renderer having no tone mapping configured. Fixed by adding lighting directly in Three.js instead — new `client/src/three/RoomLighting.ts` (a `HemisphereLight` + two `PointLight`s in Three's own units) plus `renderer.toneMapping = ACESFilmicToneMapping` in `RoomView.tsx`. Iterated against real screenshots until materials read correctly (warm wood floor, distinguishable walls/table, no clipping to white/black).
- **Hit a concurrent-agent incident mid-session**: a subagent that should have been a no-op kept running after being told to stop, and — because Blender MCP's socket server is a single shared endpoint with no per-session isolation — built its own competing room in the same live Blender scene, leaving ~82 conflicting objects (including furniture this session never asked for). Caught via `get_scene_info` showing an unrecognized object name and an object count far above expected; stopped the agent (`TaskStop`) and wiped/rebuilt the scene clean. Logged as a gotcha in `docs/decisions.md` so it isn't rediscovered the hard way.
- Branch `feat/blender-room-asset`, squash-merged into local `main`. **Not pushed.**

### Checked

Full `sanity-check` pass (lint, format, build, 46 tests across all 3 workspaces) clean, both mid-session and right before merge. **Real browser verification** (Chrome, via browser automation — the first time this project has actually visually confirmed the WebGL canvas rather than reasoning about it from code): joined a session, confirmed the room renders with correct geometry/materials/lighting and `room.glb` fetches with a 200, no console errors. **Known gap:** Chrome's Pointer Lock API rejected the automation tool's synthetic clicks (a browser security restriction), so WASD movement couldn't be re-driven end-to-end in the browser this session — rests on the unchanged, already-unit-tested `collision.ts` suite instead (valid without re-verification since the real room's dimensions match the placeholder's exactly). Dev server processes confirmed stopped, ports 3001/5173 clear afterward.

### Next session

Milestone 3 is done. Paste-to-start prompt:

> Start Milestone 4: player avatars. `player:move` drives real 3D position/orientation, server-validated; other connected players render and move as avatars in the room in real time (placeholder capsule/mesh is fine). Exit check: two+ players in the same session see each other walk around the room live.

- **Branch:** `main` — none open. `feat/blender-room-asset` merged and deleted.
- **State:** M1–M3 all done. The real Blender room (`client/public/models/room.glb`, source at `blender/room.blend`) is the default room view; the procedural placeholder (`ProceduralRoom.ts`) remains as `loadRoom()`'s no-`gltfUrl` fallback, now otherwise unused.
- **Do next:** Milestone 4 per [docs/roadmap.md](roadmap.md).
- **Watch for:** the Blender MCP concurrent-session gotcha above if Blender work resumes — check `get_scene_info`'s object count/names look sane before trusting the scene, especially if any other agent/session might have touched it. Chrome's Pointer Lock restriction under automation if UI-testing movement again — a human tester in a real (non-automated) browser session doesn't hit this.
- **Environment:** nothing running — no dev server, no Blender instance left open. Node/npm need `C:\Program Files\nodejs` added to `$env:PATH` manually in a fresh PowerShell/Bash tool session on this machine (the documented PATH-after-install gotcha, `docs/engineering/tooling.md`) — `npm` isn't found otherwise even though the install itself is fine.

---

## 2026-09-23 (Milestone 3, part 1) — First-person movement engine, proven against a procedural room

**Asked** (user): "push then go for m3. ask me if you need decisions regarding ui/ux game design visual stuff etc." Pushed Milestone 2 to `origin/main`, then asked two design questions before starting: room aesthetic (**"cozy tabletop game room"** chosen over plain gray-box) and table shape/size (**round, 4-5 players** chosen).

### Setup, before implementation

- Checked `extraction_project` for reusable Blender MCP setup (per the standing instruction to always check that repo first) — Blender 5.2, its MCP add-on, and `uvx` were already installed there. Registered the same `blender` server in this repo's own new `.mcp.json` rather than reinstalling anything. Wrote `docs/engineering/blender-workflow.md` explaining what's reusable (the MCP setup itself) versus not (the FBX→Unreal pipeline — this project targets glTF/GLB→Three.js instead).
- **Realized MCP servers only load at session startup**, so this session doesn't have the `blender` tools yet — can't actually drive Blender. Split M3 into two parts rather than block on it (`docs/decisions.md`, "Milestone 3 split in two").

### What landed (part 1: the movement engine)

- **`client/src/three/collision.ts`**: pure `resolveMovement(position, delta, room, table, playerRadius)` — axis-separated wall/table collision with wall-sliding, plus an unconditional safety-net correction for an already-invalid starting position. 13 unit tests; two-stage break-round (partial disable, then a full passthrough gutting the function) confirmed the suite genuinely exercises the logic, not just the safety net — see `docs/decisions.md` for the nuance on why 3 of the 13 tests are correctly insensitive to the partial break (the safety net legitimately covers for it, which is the intended contract).
- **`client/src/three/FirstPersonController.ts`**: wraps Three.js's `PointerLockControls` for WASD + mouse-look, re-resolving every frame's position delta through `resolveMovement` before committing it.
- **`client/src/three/ProceduralRoom.ts`**: the placeholder room — walls, wood-toned floor, a round table (radius 1.1m, 4-5 players), a bookshelf/window blockout, warm point lighting. Built directly in Three.js, **not** the real Blender asset.
- **`client/src/three/RoomLoader.ts`**: `loadRoom()` — returns the procedural room by default, or loads a real `.glb` via `GLTFLoader` if a `gltfUrl` is given. Nothing calls it with a URL yet; this is the seam Part 2 plugs into.
- **`client/src/three/RoomView.tsx`** + **`App.tsx`**: joining a session now shows the full-viewport first-person room as the main view, with the session panel (code, player list, leave) as a small corner overlay — M2's functionality stays reachable, not replaced.
- Branch `feat/room-movement-engine`, squash-merged into local `main`. **Not pushed.**

### Checked

Full `sanity-check` pass (lint, format, build, 43 tests across all 3 workspaces) clean before and after the merge. Manual pass: ran the real `npm run dev` pair, confirmed both HTTP-responded and every new `three/`-path module transformed through Vite without error (can't visually confirm the WebGL canvas in this environment — reasoned about correctness from the code and Vite's clean transform instead). **Found and cleaned up two full leftover `npm run dev` process trees from earlier work that were still listening on 3001/5173** (orphaned `tsx watch` children survive a plain `Stop-Process` on their parent — needed `taskkill /T` to actually kill the tree); confirmed both ports clear afterward.

### Next session

Paste-to-start prompt:

> Finish Milestone 3: build the real room + round table (4-5 players, "cozy tabletop game room") in Blender, export to `.glb`, and swap it in via `client/src/three/RoomLoader.ts`'s `gltfUrl` option, replacing the procedural placeholder. Blender itself is already installed — this just needs a fresh session so the `blender` MCP tools (registered in `.mcp.json`) actually load; check with `ToolSearch` or by looking for `blender`-prefixed tools before assuming they're missing.

- **Branch:** `main` — none open.
- **State:** M1 and M2 done. M3 part 1 (movement engine) done and merged; M3 part 2 (real Blender room) not started. `main` is ahead of `origin/main` — this session's work hasn't been pushed.
- **Do next:** the Blender room build above, per [docs/engineering/blender-workflow.md](engineering/blender-workflow.md) (which still has a "not yet built" status section to fill in once this actually happens) and [docs/roadmap.md](roadmap.md)'s M3 entry.
- **Watch for:** the fresh-session requirement for MCP tools; re-verify collision/exit-check behavior once real room dimensions replace the placeholder's (10m×8m room, 1.1m table radius) in case they differ enough to matter.
- **Environment:** nothing running; both dev-server ports confirmed clear at session end.

---

## 2026-09-23 (Milestone 2) — Sessions, host role, and reconnect: two clients can join and see each other

**Asked** (user): "continue with milestone 2 i will set up th remote in the mean time" — build sessions & connection per [docs/roadmap.md](roadmap.md).

### What landed

- **`shared`**: `SocketEvent.SessionState` (a new broadcast event — the spec named `session:join`/`session:leave` but not how the resulting state reaches clients) and `session.ts` (the `SessionJoinRequest`/`Response`, `SessionLeaveRequest`/`Response` payload shapes, also not specified originally).
- **`server`**: `sessionStore.ts` (an in-memory `Map<sessionId, GameState>` registry — first joiner becomes host, rejoining with the same `playerId` rebinds rather than duplicates, leaving empties/deletes the session) and `validation.ts` (runtime guards rejecting malformed `session:join`/`session:leave` payloads without crashing a handler). Wired into `server.ts`: `session:join`/`session:leave` handlers with ack callbacks, plus a room broadcast (`session:state`) on every membership change.
- **`client`**: `playerIdentity.ts` (a `sessionStorage`-backed stable id per tab — deliberately *not* `localStorage`, see below), `sessionCode.ts` (a short shareable code generator), `JoinForm.tsx` and `SessionView.tsx` (name + session-code entry, live player list with the host labeled), and `App.tsx` rewritten to wire them to the socket, including auto-rejoin on reconnect (a dropped/reconnected socket re-sends the last successful `session:join` automatically).
- Four design calls made and logged in [decisions.md](decisions.md): implicit session creation on first join, host role derived from `hostId` rather than stored per-player (host migration explicitly deferred), disconnect ≠ leave (a dropped client's `Player` record stays until an explicit leave), and `sessionStorage` over `localStorage` for identity (so two tabs of one browser stay distinct players).
- Branch `feat/sessions-connection`, squash-merged into local `main`. **Not pushed.**

### Checked

- **The M2 exit-check test** (`server/src/session.test.ts`): two real `socket.io-client`s join the same session; each sees the other in the resulting player list, host is correctly the first joiner. Break-round verified: removed the room broadcast, watched the "Alice sees Bob join" assertion time out and fail, restored it, watched it pass again. Also covers disconnect → rejoin-same-identity (no duplicate) → leave, and a malformed-payload rejection that doesn't take the server down.
- `sessionStore.test.ts` (6 unit tests) and `validation.test.ts` (15 unit tests, `it.each` over malformed payloads) cover the registry and guards in isolation.
- `npm run lint`/`format:check`/`build`/`test` all clean across `shared`/`server`/`client` — verified before committing and again after the squash-merge onto `main`.
- Manually smoke-tested against the real `npm run dev` process pair (not just the in-process test): `curl`'d `/health` and the Vite dev page, then ran two independent `socket.io-client` connections against the live server — both joins succeeded with correct player lists. One nuance, not a defect: a one-shot manual script's `.once()` listener caught a different (but still correct-at-the-time) broadcast than the in-process test does, explained in [decisions.md](decisions.md) — the real client uses a persistent `.on()` listener and isn't affected. Dev server processes confirmed stopped afterward (nothing on 3001/5173).
- **`git remote -v` now shows `origin` → `https://github.com/Chanumask/custom_tabletop.git`** (fetch+push) — the user set this up in parallel per their prompt. Nothing has been pushed to it from this session.

### Next session

Paste-to-start prompt:

> Start Milestone 3: a placeholder Blender room + table exported as glTF/GLB and loaded via Three.js's GLTFLoader, first-person camera with WASD + mouse-look movement, and collision against the walls/table. Solo exploration only — no other players visible yet (that's Milestone 4), no map/dice. Exit check: a player joins a session and can walk around a 3D room and bump into the table/walls without clipping through them.

- **Branch:** `main` — none open. `feat/sessions-connection` merged and deleted.
- **State:** sessions/connection working end to end (join, live player list, host label, reconnect). Still just a flat HTML page — no 3D/room work has started.
- **Do next:** Milestone 3 per [docs/roadmap.md](roadmap.md) — this is where the Blender/Three.js pipeline actually starts. Check `extraction_project`'s `docs/engineering/blender-workflow.md` first for the reusable parts of its Blender MCP setup (the add-on/server/per-session steps) before setting that up from scratch — its FBX→Unreal import mechanics don't transfer (we're glTF→Three.js), but the MCP setup itself is stack-agnostic. See memory or ask if this isn't already front-of-mind.
- **Watch for:** `hostId` can point at a departed player once someone leaves (host migration is deferred, see `decisions.md`) — not relevant yet since nothing is host-gated until Milestone 5, but don't be surprised by it later. The PATH-after-Node-install gotcha in [engineering/tooling.md](engineering/tooling.md) still applies to every fresh shell on this machine.
- **Environment:** nothing running — no dev server. A git remote (`origin`) now exists; whether/when to push is still an explicit per-instance ask, unchanged.

---

## 2026-09-23 (Milestone 1) — Toolchain scaffolded: npm workspaces, WebSocket round trip verified

**Asked** (user): "kick off m1" — build the toolchain scaffold per [docs/roadmap.md](roadmap.md).

### What landed

- **Node.js 24 LTS installed** via winget (`OpenJS.NodeJS.LTS`), after confirming with the user first since it's a machine-wide change, not a repo-local one.
- **npm workspaces** (`shared`, `server`, `client`), root `package.json`/`tsconfig.base.json`/`eslint.config.js` (flat config, `typescript-eslint` + React hooks/refresh rules for `client`)/`.prettierrc`/`.nvmrc`.
- **`shared`**: `GameState`/`Scene`/`Player` types and the spec's event names (`SocketEvent`) carried over from [engineering/architecture.md](engineering/architecture.md), plus placeholder `Character`/`Drawing`/`Dice`/`SoundState` shapes for milestones that don't exist yet. Added an infra-only `ConnectionEvent` (`connection:ping`/`pong`) for this milestone's exit check. Consumed as plain TS source by both other workspaces — no build step (see [engineering/tooling.md](engineering/tooling.md), new this session).
- **`server`**: Express (`/health`) + Socket.IO on one HTTP server, port 3001, connection/disconnection logging, `dev` via `tsx watch`.
- **`client`**: hand-rolled Vite + React + TypeScript (no interactive `create-vite`, no stdin available) — a connection-status page that pings the server on connect and shows the round trip succeeding.
- Branch `build/m1-toolchain-scaffold`, squash-merged into local `main`. **Not pushed.**

### Checked

- Every workspace's `build` (type-check, plus `vite build` for `client`), `lint`, `format:check`, and `test` pass clean — verified twice (before and right before commit, per the `sanity-check` skill).
- **The M1 exit-check test** (`server/src/server.test.ts` — a real server, a real `socket.io-client`, a real ping/pong round trip) was break-round verified: disabled the pong handler, watched the test fail with a timeout, restored it, watched it pass again. Not a false positive.
- Also smoke-tested outside Vitest: ran the real `tsx` dev process and `curl`'d `/health` for a real HTTP response, then confirmed the process was stopped afterward (port 3001 unreachable) — nothing left running.
- `npm audit` flags 5 advisories in `vite`/`esbuild`/`vitest` dev-server code paths; accepted for now rather than force-upgrading to breaking major versions mid-milestone (logged in [decisions.md](decisions.md) and [engineering/tooling.md](engineering/tooling.md)).
- Hit and logged one real gotcha: TS project references from `server`/`client` to `shared` don't work when `shared` has no build step (`tsc` requires referenced projects to be `composite` and emit) — dropped the references, plain `node_modules` resolution works fine instead (logged in [decisions.md](decisions.md)).

### Next session

Paste-to-start prompt:

> Start Milestone 2: session:join/leave, a server-side session registry, host vs. player role assignment, a server-authoritative GameState shell broadcast to a session's clients, and basic reconnect handling. Exit check: two+ browser tabs join the same session and see each other in a player list.

- **Branch:** `main` — none open. `build/m1-toolchain-scaffold` merged and deleted.
- **State:** toolchain scaffolded and verified (lint/format/build/test all clean, WebSocket round trip proven both by test and by a real dev-server run). No session/game-state logic yet.
- **Do next:** Milestone 2 per [docs/roadmap.md](roadmap.md).
- **Watch for:** the PATH-after-Node-install gotcha in [engineering/tooling.md](engineering/tooling.md) if `node`/`npm` seem to have vanished again in a stale shell. `shared`'s placeholder types (`Character`, `Drawing`, `Dice`, `SoundState`) are minimal stand-ins — expect to extend them as each consuming milestone lands, not treat them as final.
- **Environment:** nothing running — no dev server, no editor state. `npm install` already run at the repo root.

---

## 2026-09-23 — Repo scaffolded, then the player-experience direction settled: a walkable 3D room

**Asked** (user): set up a basic, non-overkill repo (version control + proper workflow) for the virtual-tabletop project described in a handed-over design specification, reusing the process/workflow docs from the sibling `extraction_project` repo, and present a build roadmap with milestones.

### What landed — repo setup

- Read the design specification (tech stack, architecture, event model, client state shape, sync/authority model, performance approach, project structure — preserved at [docs/engineering/architecture.md](engineering/architecture.md)).
- Read `extraction_project`'s `CLAUDE.md`, `docs/process/*`, `docs/overview.md`, `docs/decisions.md`, `docs/changelog.md`, and its `feature-workflow`/`sanity-check` skills to reuse the pattern.
- Set up this repo: `CLAUDE.md`, `README.md`, `docs/overview.md`, `docs/roadmap.md`, `docs/decisions.md`, `docs/changelog.md` (this file), `docs/process/` (`README.md`, `git-workflow.md`, `session-handover.md`), `docs/engineering/` (`README.md`, `architecture.md`), `.claude/skills/` (`feature-workflow`, `sanity-check`), `.gitignore`, and empty `client/`/`server/`/`shared/` placeholders for Milestone 1.
- Initialized git, made the initial scaffold commit directly to `main` (docs/config only — no application code yet).

### Checked

Node.js is **not installed** on this machine — confirmed via `node --version` failing in both bash and PowerShell. This is why Milestone 1 starts with toolchain install rather than assuming it's there.

### What landed — player-experience direction

**Asked** (user, follow-up): hadn't read the spec message directly — asked what the player experience actually is per the spec, then described their own vision (a Blender-generated 3D room with a table/map and interactables) and whether it's compatible.

Walked through the spec's implied experience (2D top-down map filling the screen, 3D dice/figures as an accent layer over it — the Roll20/Foundry model) versus the user's vision (a walkable 3D room), and assessed them as compatible: the event model, `GameState` shape, delta-only sync, and server authority are untouched either way — only *where* the map/drawing renders and how the player moves changes. Asked the user to pick a camera model (fixed/orbit vs. free first-person vs. hybrid); **they chose free first-person walk-around**, the more ambitious/immersive option.

Updated docs to make this the standing plan rather than a chat-only decision: [decisions.md](decisions.md) (new entry), [engineering/architecture.md](engineering/architecture.md) (new "Extension" section — original spec kept intact below it, since the event model/stack still apply), [roadmap.md](roadmap.md) (reordered: room + first-person movement now land before the tabletop map/drawing milestone, since the room is the primary view rather than an overlay), `overview.md` and `CLAUDE.md` (updated framing).

### Next session

Paste-to-start prompt:

> Start Milestone 1: install Node.js, set up the npm workspace (`client`/`server`/`shared`), scaffold a Vite+React client and a Node+TypeScript+Socket.IO server, wire up ESLint/Prettier and a test runner, and get one WebSocket round-trip working end to end. (Milestone 3 is where the 3D room/first-person movement actually starts — Milestone 1 is just the toolchain.)

- **Branch:** `main` — none open.
- **State:** repo/docs/workflow scaffolded, player-experience direction (walkable 3D room, first-person) decided and documented. No application code yet.
- **Do next:** Milestone 1 per [docs/roadmap.md](docs/roadmap.md).
- **Watch for:** Node.js isn't installed yet — that's the first step, not an assumption to skip. Milestone 1 has no 3D/room work in it yet — don't jump ahead to Blender/Three.js setup before the basic client/server/shared scaffold and WebSocket round-trip are working.
- **Environment:** nothing running; no editor/dev-server state to verify.
