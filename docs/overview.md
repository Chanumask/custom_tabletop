# Overview

← [CLAUDE.md](../CLAUDE.md)

## Vision

**Custom Tabletop** — a browser-based virtual tabletop (VTT) for running tabletop RPG sessions. One host, several players, all in a modern desktop browser, no install. A shared 2D canvas carries maps and freehand drawing; a 3D layer (WebGL/Three.js) carries player tokens, dice, and future 3D objects, rendered independently on top of the 2D/UI layers. The server is the single source of truth for session state — clients render it, they don't own it.

Scope is deliberately narrow at the start: get a host and a few players sharing a scene, drawing on it, and rolling dice together in real time, before adding anything beyond that.

## Where it stands (2026-09-23)

**Pre-implementation.** This session set up the repository: version control, documentation structure, and the Claude Code workflow (`docs/process/`, `.claude/skills/`), adapted from a sister project's proven setup. No application code exists yet — Node.js itself isn't installed on this machine yet, so Milestone 1 (see [roadmap.md](roadmap.md)) starts with toolchain setup.

The original design/technical specification that shaped this setup is captured in [docs/engineering/architecture.md](engineering/architecture.md).

## Non-goals (for now)

- No native desktop client.
- No mobile/touch-optimized layout.
- No persistence beyond the current session (save/load campaigns is a later concern, not in the initial milestones).
- No voice/video — only a mute/unmute signal for a soundboard, per the spec.

[roadmap.md](roadmap.md) has the milestone plan, [changelog.md](changelog.md) the session-by-session history, and [decisions.md](decisions.md) the reasoning behind non-obvious choices.
