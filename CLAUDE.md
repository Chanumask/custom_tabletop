# CLAUDE.md

Entry point for Claude Code sessions in this repo. Keep this file short — it orients, it doesn't hold knowledge. Details live in `docs/` and link back here.

## Project

**Custom Tabletop** — a browser-based virtual tabletop for running tabletop RPG sessions as a **walkable 3D room** (Blender-built, first-person, WASD + mouse-look): a table whose surface carries the map/drawing (rendered as a canvas texture), 3D dice, and player avatars, all real-time multiplayer over WebSockets with server-authoritative state. No native client — Chrome/Edge/Firefox, Safari best-effort. See [docs/decisions.md](docs/decisions.md) (2026-09-23) for why this isn't the flat 2D-map version the original spec describes.

Status: **Milestones 1-9 done, plus the owner's seven follow-up change requests (2026-09-25): identity/presence, player colors and six animated characters, a furnished square-table room with a map crop dialog, a whiteboard, a redesigned join screen, soundboard links, and a four-player sync test. Extras: real d4–d20 dice, chat/log with `/roll` and speech bubbles, pings, and a map grid.** Earlier extensions: file uploads (M5/M7), a session-menu/settings extension, and a wall-soundboard rework — toolchain, sessions/connection, the 3D room shell (real Blender-built room, first-person movement/collision), player avatars, the tabletop map/drawing (host-swappable background by URL or file upload, live collaborative drawing on the physical table), dice (server-authoritative spawn/roll/remove, animated and visible to everyone), soundboard/mute (any player can trigger a sound — built-in tones, uploaded files, or direct-linked audio files — everyone hears; self- or host-mute visible to the group), room interactables (a light switch, a full-screen sit-down mode at the table with a pen/eraser drawing toolbar, and a wall-mounted 4x4 soundboard with per-button sound assignment via an aim + E interaction), host authority hardening (every host-gated action proven, server-side, to reject a non-host — `sound:play` since relaxed to open, see decisions.md), and a categorized-tabs session menu with client-only settings (volume, a rebindable interact key) all work end to end. Remaining: Milestone 10 (performance & polish). Known gaps: M9's cross-browser pass (Edge/Firefox) wasn't performed — this environment only drives Chrome; the ~930 KB bundle isn't code-split yet (M10). See [docs/roadmap.md](docs/roadmap.md) for milestones and [docs/overview.md](docs/overview.md) for the full picture.

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

Exact commands: [docs/engineering/tooling.md](docs/engineering/tooling.md) (`npm run lint`, `npm run format:check`, `npm run build`, `npm test`, or just run the `sanity-check` skill).

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
