# Changelog

← [CLAUDE.md](../CLAUDE.md)

Dated log of what happened each session. Newest first.

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
