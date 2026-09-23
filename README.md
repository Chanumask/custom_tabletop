# Custom Tabletop

A browser-based virtual tabletop for running tabletop RPG sessions with friends: a shared 2D canvas for maps and drawing, a 3D layer for dice and player tokens, real-time multiplayer, no installation required.

## Status

**Pre-implementation.** Repo, docs, and workflow are set up; see [docs/roadmap.md](docs/roadmap.md) for the build plan.

## Stack

Node.js + TypeScript (server), React + TypeScript (client), Socket.IO (real-time), HTML5 Canvas (2D), Three.js/WebGL (3D). Details: [docs/engineering/architecture.md](docs/engineering/architecture.md).

## Docs

Project knowledge lives in [`docs/`](docs/), indexed from [`CLAUDE.md`](CLAUDE.md) — start there.

- [docs/overview.md](docs/overview.md), [docs/roadmap.md](docs/roadmap.md), [docs/decisions.md](docs/decisions.md), [docs/changelog.md](docs/changelog.md) — always-relevant, at the root
- [docs/process/](docs/process/README.md) — how work happens (git workflow, session handover)
- [docs/engineering/](docs/engineering/README.md) — architecture and tech stack

Project-scoped Claude Code skills live in [`.claude/skills/`](.claude/skills/).
