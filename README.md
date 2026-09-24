# Custom Tabletop

A browser-based virtual tabletop for running tabletop RPG sessions with friends: a walkable 3D room (Blender-built, first-person, WASD + mouse-look) with a round table whose surface carries the map/drawing, 3D dice, player avatars, a soundboard, and a couple of interactable room objects — all real-time multiplayer over WebSockets, no installation required. (This is a deliberate, documented departure from a flatter 2D-map-with-3D-accents version — see [docs/decisions.md](docs/decisions.md), 2026-09-23.)

## Status

**Milestones 1–8 done**, plus a file-uploads extension. A host and players can: walk around the room and see each other live; swap the table's map background by URL or file upload and draw on it together; spawn/roll/remove dice; play sounds from a shared soundboard (built-in tones or uploaded files) via a 2D panel or a physical in-room console; flip the room's light switch; and sit down at the table for a full-screen, square top-down view of it with a pen/eraser drawing toolbar. Remaining: Milestone 9 (host authority hardening — an audit pass) and Milestone 10 (performance & polish). Full detail in [docs/overview.md](docs/overview.md) and [docs/roadmap.md](docs/roadmap.md).

## Running it locally

```
npm install
npm run dev
```

Starts the server (`http://localhost:3001`, health check at `/health`) and the client (`http://localhost:5173`) together. Open the client URL in a browser, enter a name, and either generate a session code (hosts) or enter an existing one to join. Open it in a second tab/browser to see multiplayer in action. Full command reference: [docs/engineering/tooling.md](docs/engineering/tooling.md).

## Stack

Node.js + TypeScript (server), React + TypeScript (client), Socket.IO (real-time), HTML5 Canvas (2D, the table's map/drawing texture), Three.js/WebGL (3D, the room itself). Details: [docs/engineering/architecture.md](docs/engineering/architecture.md).

## Docs

Project knowledge lives in [`docs/`](docs/), indexed from [`CLAUDE.md`](CLAUDE.md) — start there.

- [docs/overview.md](docs/overview.md), [docs/roadmap.md](docs/roadmap.md), [docs/decisions.md](docs/decisions.md), [docs/changelog.md](docs/changelog.md) — always-relevant, at the root
- [docs/process/](docs/process/README.md) — how work happens (git workflow, session handover)
- [docs/engineering/](docs/engineering/README.md) — architecture and tech stack

Project-scoped Claude Code skills live in [`.claude/skills/`](.claude/skills/).
