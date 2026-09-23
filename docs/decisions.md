# Decisions

← [CLAUDE.md](../CLAUDE.md)

Running log of decisions worth remembering across sessions. Newest first. Each entry: what was decided, why, and what it rules out.

---

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

**2026-09-23** — Player experience is a walkable 3D room, not a 2D map with 3D accents; repo workflow reused from `extraction_project`, trimmed to scope; documentation-only commits allowed to `main`; tech stack taken as given from the source spec
