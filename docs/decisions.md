# Decisions

← [CLAUDE.md](../CLAUDE.md)

Running log of decisions worth remembering across sessions. Newest first. Each entry: what was decided, why, and what it rules out.

---

## 2026-09-23 — Repo workflow reused from `extraction_project`, trimmed to this project's scope

**Decided.** The docs/process structure (`CLAUDE.md` entry point, `docs/overview.md` + `decisions.md` + `changelog.md` as always-read logs, `docs/process/` for git workflow and session handover, `.claude/skills/` for `feature-workflow` and `sanity-check`) is carried over from the sibling `extraction_project` repo, which has iterated this pattern over many sessions. **Dropped:** the `parallel-agents` skill/doc and its worktree-based subagent orchestration — that repo is a large multi-system Unreal project where independent features genuinely parallelize; this project is small and solo right now. If scope grows enough to justify it, add it back modeled on that repo's version rather than improvising one. **Rules out:** treating this repo's process docs as needing the same weight as a mature project's — they should stay this light until the project's actual complexity demands more.

## 2026-09-23 — Documentation-only commits allowed straight to `main`; everything else needs a branch

**Decided**, matching `extraction_project`'s convention. **Why:** cheap for the common case (a doc fix shouldn't need branch ceremony) while still keeping `main` buildable — application code always goes through review-by-self on a branch first. **Rules out:** committing a docs change bundled with app code straight to `main`; if they're bundled, the whole commit goes through a branch.

## 2026-09-23 — Tech stack taken as given from the source specification, not re-litigated

**Decided.** The technical stack and architecture (Node.js + TypeScript backend, React + TypeScript frontend, Socket.IO, HTML5 Canvas for 2D, Three.js/WebGL for 3D, npm-workspace `client`/`server`/`shared` layout) came from a design specification handed to this session (preserved in [engineering/architecture.md](engineering/architecture.md)) and is treated as the starting point rather than something to evaluate alternatives for. The spec itself notes the concrete libraries may be adjusted during implementation as long as the functional requirements hold — so this isn't a hard lock, just a default not worth re-deciding before any code exists. **Rules out:** spending Milestone 1 time comparing frameworks (e.g. Vue vs. React) without a concrete reason one is failing.

---

## Table of Contents

**2026-09-23** — Repo workflow reused from `extraction_project`, trimmed to scope; documentation-only commits allowed to `main`; tech stack taken as given from the source spec
