# Custom Tabletop

A browser-based virtual tabletop for running tabletop RPG sessions with friends: a walkable 3D room (Blender-built, first-person, WASD + mouse-look) with a square table whose surface carries the map/drawing, real 3D dice, animated player characters, chat, a wall soundboard, a whiteboard and other interactable room objects — all real-time multiplayer over WebSockets, no installation required. (This is a deliberate, documented departure from a flatter 2D-map-with-3D-accents version — see [docs/decisions.md](docs/decisions.md), 2026-09-23.)

## Status

**All ten roadmap milestones are done**, plus the owner's follow-up change requests and a round of extras. Everything a table needs:
- **The room.** A cozy, lived-in Blender room with a crackling fireplace, candles, fairy lights, a moonlit window, a lounge nook and a console TV. You walk around it in first person and see each other's animated characters. Six colors, one character each; they walk, run, sit and emote.
- **The table.** A square table with the map in true colors (crop it on upload, lay an optional grid) or aged parchment when there's no map. Anyone can draw on it live. Sit down to look around from your chair, or press V for a top-down view.
- **Dice.** Real d4–d20 that tumble and land on the server's roll, with sound. You can also type `/roll 2d6+3` in chat.
- **Talking.** Chat with speech bubbles, a session log of every roll, and right-click pings on the table.
- **Sound and video.** A 4x4 wall soundboard (built-in tones, uploaded files, audio links). YouTube clips play on the TV for everyone.
- **The rest.** A shared whiteboard. A light switch for a fire-lit room. Invite links. A collapsible session menu with volume, a rebindable interact key and a fire-sound toggle.

**Deployed** as one Docker container to the owner's VPS, to be served at **https://tabletop.murri.me** once its proxy host is set up. It's open to anyone with the link; uploads are capped and cleaned up automatically. How: [docs/engineering/deployment.md](docs/engineering/deployment.md).

It runs at 60 fps (1080p, mid-range GPU). The join screen loads ~70 KB gzipped, and the room downloads behind it. Each player uses ~13 KB/s in a busy six-player game. Tested end to end in Chromium, Firefox, WebKit and Edge (`npm run test:e2e`). Full detail: [docs/overview.md](docs/overview.md) and [docs/roadmap.md](docs/roadmap.md).

## Running it locally

```
npm install
npm run dev
```

Starts the server (`http://localhost:3001`, health check at `/health`) and the client (`http://localhost:5173`) together. Open the client URL in a browser, enter a name, and either generate a session code (hosts) or enter an existing one to join. Open it in a second tab/browser to see multiplayer in action. `npm test` runs the unit tests, and `npm run test:e2e` runs the cross-browser smoke tests (first time: `npx playwright install`). Deploying to the VPS: `npm run deploy` ([docs/engineering/deployment.md](docs/engineering/deployment.md)). Full command reference: [docs/engineering/tooling.md](docs/engineering/tooling.md).

## Stack

Node.js + TypeScript (server), React + TypeScript (client), Socket.IO (real-time), HTML5 Canvas (2D, the table's map/drawing texture), Three.js/WebGL (3D, the room itself). Details: [docs/engineering/architecture.md](docs/engineering/architecture.md).

## Docs

Project knowledge lives in [`docs/`](docs/), indexed from [`CLAUDE.md`](CLAUDE.md) — start there.

- [docs/overview.md](docs/overview.md), [docs/roadmap.md](docs/roadmap.md), [docs/decisions.md](docs/decisions.md), [docs/changelog.md](docs/changelog.md) — always-relevant, at the root
- [docs/process/](docs/process/README.md) — how work happens (git workflow, session handover)
- [docs/engineering/](docs/engineering/README.md) — architecture and tech stack

Project-scoped Claude Code skills live in [`.claude/skills/`](.claude/skills/).
