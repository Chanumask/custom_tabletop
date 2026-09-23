# CLAUDE.md

Entry point for Claude Code sessions in this repo. Keep this file short — it orients, it doesn't hold knowledge. Details live in `docs/` and link back here.

## Project

**Custom Tabletop** — a browser-based virtual tabletop for running tabletop RPG sessions: shared 2D canvas for drawing/maps, a 3D layer (Three.js) for dice and player tokens, real-time multiplayer over WebSockets, server-authoritative state. No native client — Chrome/Edge/Firefox, Safari best-effort.

Status: **pre-implementation.** The repo, docs, and workflow are set up; no application code exists yet. See [docs/roadmap.md](docs/roadmap.md) for milestones and [docs/overview.md](docs/overview.md) for the full picture.

## Where things live

Always relevant:

| File | Contents |
|---|---|
| [docs/overview.md](docs/overview.md) | Vision, scope, current status |
| [docs/roadmap.md](docs/roadmap.md) | Milestones — what gets built, in what order |
| [docs/decisions.md](docs/decisions.md) | Decision log — what was decided, why, when |
| [docs/changelog.md](docs/changelog.md) | Dated log of what happened each session |

Everything else is grouped by what it's for. Read the category's own index first:

| Category | Read when... |
|---|---|
| [docs/process/](docs/process/README.md) | Doing any git/commit/branch work, or starting/ending a session |
| [docs/engineering/](docs/engineering/README.md) | Touching architecture, tech stack, or client/server structure |

### Session start and handover

On the first prompt of a new session, before acting on it: read `docs/decisions.md` and `docs/changelog.md` in full, then follow into `docs/process/` and/or `docs/engineering/` if the prompt's topic touches them.

If the newest `docs/changelog.md` entry ends with a **Next session** block, the previous session left work in flight — that block is the handover and this session's starting point. Verify anything it claims about branch/tooling state before trusting it. Full procedure: [docs/process/session-handover.md](docs/process/session-handover.md).

## Working agreements

- **Stack:** Node.js + TypeScript backend, React + TypeScript frontend, Socket.IO for real-time sync, HTML5 Canvas for 2D, Three.js/WebGL for 3D. Full rationale in [docs/engineering/architecture.md](docs/engineering/architecture.md).
- Log any non-obvious decision (tooling, architecture) in `docs/decisions.md` as it's made, not after the fact.
- Add a dated entry to `docs/changelog.md` at the end of a session that changed project state. If work is left in flight, end it with a **Next session** handover block.
- When a new knowledge area emerges that doesn't fit the existing docs, add a new file under `docs/` and link it from the relevant index rather than growing an existing file past its topic.

### Sanity work — do this without being asked

- Evaluate alternatives before settling on an approach.
- Check new work against what's already logged in `docs/decisions.md` before writing code.
- Write tests for new code and actually run them.
- Run the project's linter/formatter and confirm it's clean, both after writing code and again before committing.

Exact commands live in [docs/engineering/tooling.md](docs/engineering/tooling.md) once the toolchain exists (Milestone 1) — until then this section is aspirational, not yet actionable.

### Git workflow

- **Commits are pre-authorized.** Make them freely as work reaches a coherent, working point.
- **Pushing is never pre-authorized.** Always ask and get an explicit go-ahead before `git push`.
- **Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):** `type(scope): summary` — `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `build`, `ci`, `style`.
- **Documentation-only changes** (`docs/`, `CLAUDE.md`, `README.md`, `.claude/`) may commit straight to `main`. Anything touching application code goes through a feature branch. Full detail: [docs/process/git-workflow.md](docs/process/git-workflow.md).

### Skills

This repo defines project-scoped skills under `.claude/skills/`:

- **`feature-workflow`** — the standard branch → implement → test → lint → document → commit → merge-back sequence for one feature/fix.
- **`sanity-check`** — the lint/format + test pass, standalone or as a step inside `feature-workflow`.

This is a solo, small-scope project — there's no parallel-subagent workflow here. If that changes as scope grows, add one modeled on the pattern rather than improvising.
