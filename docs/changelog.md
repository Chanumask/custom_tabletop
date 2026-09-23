# Changelog

← [CLAUDE.md](../CLAUDE.md)

Dated log of what happened each session. Newest first.

---

## 2026-09-23 — Repo scaffolded: version control, docs, workflow

**Asked** (user): set up a basic, non-overkill repo (version control + proper workflow) for the virtual-tabletop project described in a handed-over design specification, reusing the process/workflow docs from the sibling `extraction_project` repo, and present a build roadmap with milestones.

### What landed

- Read the design specification (tech stack, architecture, event model, client state shape, sync/authority model, performance approach, project structure — now preserved at [docs/engineering/architecture.md](engineering/architecture.md)).
- Read `extraction_project`'s `CLAUDE.md`, `docs/process/*`, `docs/overview.md`, `docs/decisions.md`, `docs/changelog.md`, and its `feature-workflow`/`sanity-check` skills to reuse the pattern.
- Set up this repo: `CLAUDE.md`, `README.md`, `docs/overview.md`, `docs/roadmap.md` (8 milestones, M0–M8), `docs/decisions.md`, `docs/changelog.md` (this file), `docs/process/` (`README.md`, `git-workflow.md`, `session-handover.md`), `docs/engineering/` (`README.md`, `architecture.md`), `.claude/skills/` (`feature-workflow`, `sanity-check`), `.gitignore`, and empty `client/`/`server`/`shared/` placeholders for Milestone 1.
- Initialized git, made the initial scaffold commit directly to `main` (docs/config only — no application code yet).

### Checked

Node.js is **not installed** on this machine — confirmed via `node --version` failing in both bash and PowerShell. This is why Milestone 1 starts with toolchain install rather than assuming it's there.

### Next session

Paste-to-start prompt:

> Start Milestone 1: install Node.js, set up the npm workspace (`client`/`server`/`shared`), scaffold a Vite+React client and a Node+TypeScript+Socket.IO server, wire up ESLint/Prettier and a test runner, and get one WebSocket round-trip working end to end.

- **Branch:** `main` — none open.
- **State:** repo/docs/workflow scaffolded, no application code yet.
- **Do next:** Milestone 1 per [docs/roadmap.md](docs/roadmap.md).
- **Watch for:** Node.js isn't installed yet — that's the first step, not an assumption to skip.
- **Environment:** nothing running; no editor/dev-server state to verify.
