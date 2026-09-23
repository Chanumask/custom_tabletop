# Decisions

← [CLAUDE.md](../CLAUDE.md)

Running log of decisions worth remembering across sessions. Newest first. Each entry: what was decided, why, and what it rules out.

---

## 2026-09-23 — TS project references dropped in favor of plain node_modules resolution for `shared`

**Decided.** `server/tsconfig.json` and `client/tsconfig.json` originally declared a TypeScript project reference (`"references": [{ "path": "../shared" }]`) to `shared`. `tsc` rejected it: a referenced project must be `"composite": true` and may not disable emit, which conflicts with `shared` being consumed as plain TS source (`main`/`types` pointing straight at `src/index.ts`, no build step — see [engineering/tooling.md](engineering/tooling.md)). Dropped the `references` array from both; `@custom-tabletop/shared` still resolves correctly for both type-checking and runtime through ordinary Node module resolution via the npm-workspace symlink in `node_modules`, which reads `shared/package.json`'s `main`/`types` fields directly — no project-reference machinery needed for a package with no build step of its own. **Rules out:** using `tsc -b` for this repo unless `shared` later gains a real build step (e.g. if it needs to ship compiled output to something that isn't `tsx`/Vite). **Verified:** `npm run build` type-checks clean in all three workspaces.

## 2026-09-23 — Server port 3001, client dev port 5173 (Vite default); ping/pong added as an infra-only event pair

**Decided.** Server listens on `3001` (`PORT` env var, default), Vite serves the client on its default `5173`; the client reads the server URL from `VITE_SERVER_URL` (see `client/.env.example`). None of the spec's domain events (`docs/engineering/architecture.md`) are a generic connectivity check, so a `connection:ping`/`connection:pong` pair was added in `shared/src/events.ts`, explicitly namespaced apart from `SocketEvent` (as `ConnectionEvent`) so it reads as infrastructure, not a Milestone-2+ domain event. **Rules out:** overloading a real domain event (e.g. `session:join`) as the M1 connectivity proof, which would've tied an infra concern to game logic prematurely.

## 2026-09-23 — `npm audit` vulnerabilities in dev-server tooling accepted, not fixed, for now

**Decided.** `npm install` surfaces 5 advisories (3 moderate, 1 high, 1 critical) in `vite`/`esbuild`/`vitest`'s dev-server request-handling code — all about a *local dev server* accepting requests it shouldn't, not a production runtime risk for a project with no Vite-dev-server-based deployment. Fixing means `npm audit fix --force`, which bumps to `vite@8`/`vitest@5` — a breaking-change upgrade out of scope for a toolchain-scaffolding milestone. **Rules out:** silently ignoring this going forward — logged here and in [engineering/tooling.md](engineering/tooling.md) so it gets revisited before anything is deployed or exposed beyond localhost, rather than forgotten.

## 2026-09-23 — Player experience is a walkable 3D room, not a 2D map with 3D accents

**Decided.** The source spec ([engineering/architecture.md](engineering/architecture.md)) describes a 2D-canvas-first VTT — a top-down map filling the screen, with a Three.js layer floating 3D dice/figures over it (Roll20/Foundry model). The actual product vision is a **Blender-built 3D room** (a big table, walls, interactable furniture) that the player **walks around in free first-person** (WASD + mouse-look, collision). The map/drawing surface becomes a `THREE.CanvasTexture` applied to the table inside that room, rather than a full-screen 2D canvas.

**Why this still fits the spec rather than replacing it:** the drawing event model, delta-only sync, `GameState` shape (`Player.position` was already `x/y/z`, not 2D), and server-authority rules are untouched — only *where* things render changes. The spec itself scopes Three.js for "future 3D tabletop objects," which a room and its furniture are simply more of.

**What's genuinely new, not implied by the original spec:** a Blender → glTF/GLB → `GLTFLoader` asset pipeline, first-person movement/collision code, and room interactables (their own event, e.g. `object:interact`, server-validated like everything else).

**Rules out:** the flat top-down map as the primary/only view, and an orbit-only camera (considered and rejected in favor of full walk-around — more scope, but it's the actual vision, not a simplification of it). **Reorders the roadmap:** room + first-person movement now land *before* the tabletop map/drawing milestone, since the room is the primary view the map lives inside of, not an overlay on top of it — see [roadmap.md](roadmap.md).

## 2026-09-23 — Repo workflow reused from `extraction_project`, trimmed to this project's scope

**Decided.** The docs/process structure (`CLAUDE.md` entry point, `docs/overview.md` + `decisions.md` + `changelog.md` as always-read logs, `docs/process/` for git workflow and session handover, `.claude/skills/` for `feature-workflow` and `sanity-check`) is carried over from the sibling `extraction_project` repo, which has iterated this pattern over many sessions. **Dropped:** the `parallel-agents` skill/doc and its worktree-based subagent orchestration — that repo is a large multi-system Unreal project where independent features genuinely parallelize; this project is small and solo right now. If scope grows enough to justify it, add it back modeled on that repo's version rather than improvising one. **Rules out:** treating this repo's process docs as needing the same weight as a mature project's — they should stay this light until the project's actual complexity demands more.

## 2026-09-23 — Documentation-only commits allowed straight to `main`; everything else needs a branch

**Decided**, matching `extraction_project`'s convention. **Why:** cheap for the common case (a doc fix shouldn't need branch ceremony) while still keeping `main` buildable — application code always goes through review-by-self on a branch first. **Rules out:** committing a docs change bundled with app code straight to `main`; if they're bundled, the whole commit goes through a branch.

## 2026-09-23 — Tech stack taken as given from the source specification, not re-litigated

**Decided.** The technical stack and architecture (Node.js + TypeScript backend, React + TypeScript frontend, Socket.IO, HTML5 Canvas for 2D, Three.js/WebGL for 3D, npm-workspace `client`/`server`/`shared` layout) came from a design specification handed to this session (preserved in [engineering/architecture.md](engineering/architecture.md)) and is treated as the starting point rather than something to evaluate alternatives for. The spec itself notes the concrete libraries may be adjusted during implementation as long as the functional requirements hold — so this isn't a hard lock, just a default not worth re-deciding before any code exists. **Rules out:** spending Milestone 1 time comparing frameworks (e.g. Vue vs. React) without a concrete reason one is failing.

---

## Table of Contents

**2026-09-23** — TS project references dropped for `shared`; server/client ports and the infra-only ping/pong event pair; `npm audit` dev-tooling vulnerabilities accepted for now; player experience is a walkable 3D room, not a 2D map with 3D accents; repo workflow reused from `extraction_project`, trimmed to scope; documentation-only commits allowed to `main`; tech stack taken as given from the source spec
