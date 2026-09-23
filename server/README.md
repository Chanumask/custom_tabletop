# server

Node.js + TypeScript backend (Express REST + Socket.IO). Scaffolded in Milestone 1 — see [../docs/roadmap.md](../docs/roadmap.md) and [../docs/engineering/tooling.md](../docs/engineering/tooling.md) for commands.

Currently just a health-check route and a `connection:ping`/`connection:pong` round trip (M1's exit check, `server.test.ts`). The `sessions`/`websocket`/`scenes`/`players`/`game-state` structure from [../docs/engineering/architecture.md](../docs/engineering/architecture.md) lands starting Milestone 2.
