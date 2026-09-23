# Overview

← [CLAUDE.md](../CLAUDE.md)

## Vision

**Custom Tabletop** — a browser-based virtual tabletop (VTT) for running tabletop RPG sessions, built as a **walkable 3D room**: a Blender-built space with a big table and interactable furniture, explored in free first-person (WASD + mouse-look). The map and freehand drawing live as a texture on the table surface, not a full-screen 2D layer. Dice and player avatars are 3D objects in that same room. One host, several players, all in a modern desktop browser, no install. The server is the single source of truth for session state — clients render it, they don't own it.

Scope is deliberately narrow at the start: get a host and a few players walking around one room together, sharing a table map, drawing on it, and rolling dice together in real time, before adding anything beyond that.

## Where it stands (2026-09-23)

**Pre-implementation.** This session set up the repository (version control, documentation structure, the Claude Code workflow — `docs/process/`, `.claude/skills/` — adapted from a sister project's proven setup) and then settled the player-experience direction: a walkable 3D room rather than a flat 2D map with 3D accents (full reasoning in [decisions.md](decisions.md)). No application code exists yet — Node.js itself isn't installed on this machine yet, so Milestone 1 (see [roadmap.md](roadmap.md)) starts with toolchain setup.

The original design/technical specification is captured in [docs/engineering/architecture.md](engineering/architecture.md), along with the room extension decided this session.

## Non-goals (for now)

- No native desktop client.
- No mobile/touch-optimized layout.
- No persistence beyond the current session (save/load campaigns is a later concern, not in the initial milestones).
- No voice/video — only a mute/unmute signal for a soundboard, per the spec.

[roadmap.md](roadmap.md) has the milestone plan, [changelog.md](changelog.md) the session-by-session history, and [decisions.md](decisions.md) the reasoning behind non-obvious choices.
