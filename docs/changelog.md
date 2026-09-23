# Changelog

← [CLAUDE.md](../CLAUDE.md)

Dated log of what happened each session. Newest first.

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
