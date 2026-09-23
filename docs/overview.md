# Overview

← [CLAUDE.md](../CLAUDE.md)

## Vision

**Custom Tabletop** — a browser-based virtual tabletop (VTT) for running tabletop RPG sessions, built as a **walkable 3D room**: a Blender-built space with a big table and interactable furniture, explored in free first-person (WASD + mouse-look). The map and freehand drawing live as a texture on the table surface, not a full-screen 2D layer. Dice and player avatars are 3D objects in that same room. One host, several players, all in a modern desktop browser, no install. The server is the single source of truth for session state — clients render it, they don't own it.

Scope is deliberately narrow at the start: get a host and a few players walking around one room together, sharing a table map, drawing on it, and rolling dice together in real time, before adding anything beyond that.

## Where it stands (2026-09-24)

**Milestones 1-5 done.** The npm-workspace toolchain, sessions/connection (join, live player list, host role, reconnect), the 3D room shell (a real Blender-built "cozy tabletop game room" with a round table, first-person WASD + mouse-look movement, wall/table collision), player avatars (other connected players render as placeholder capsules and move live), and the tabletop map/drawing (the host swaps the table's background image, any player draws directly on the physical table surface, both live for everyone) all work end to end — see [roadmap.md](roadmap.md) for exactly what each milestone covers and [changelog.md](changelog.md) for how they were built. No dice yet (Milestone 6+).

The player-experience direction — a walkable 3D room rather than a flat 2D map with 3D accents — was settled early (full reasoning in [decisions.md](decisions.md)) and everything since has built toward it.

The original design/technical specification is captured in [docs/engineering/architecture.md](engineering/architecture.md), along with the room extension decided this session.

## Non-goals (for now)

- No native desktop client.
- No mobile/touch-optimized layout.
- No persistence beyond the current session (save/load campaigns is a later concern, not in the initial milestones).
- No voice/video — only a mute/unmute signal for a soundboard, per the spec.

[roadmap.md](roadmap.md) has the milestone plan, [changelog.md](changelog.md) the session-by-session history, and [decisions.md](decisions.md) the reasoning behind non-obvious choices.
