# Overview

← [CLAUDE.md](../CLAUDE.md)

## Vision

**Custom Tabletop** — a browser-based virtual tabletop (VTT) for running tabletop RPG sessions, built as a **walkable 3D room**: a Blender-built space with a big table and interactable furniture, explored in free first-person (WASD + mouse-look). The map and freehand drawing live as a texture on the table surface, not a full-screen 2D layer. Dice and player avatars are 3D objects in that same room. One host, several players, all in a modern desktop browser, no install. The server is the single source of truth for session state — clients render it, they don't own it.

Scope is deliberately narrow at the start: get a host and a few players walking around one room together, sharing a table map, drawing on it, and rolling dice together in real time, before adding anything beyond that.

## Where it stands (2026-09-26)

**All ten roadmap milestones are done**, plus the owner's seven follow-up change requests and two rounds of extras. The final round (see [changelog.md](changelog.md)) covered:
- **Seated play.** Sitting down shows the view from your chair (free look, see the others) or, with V, the top-down table.
- **The cozy room.** A fireplace with a fire sound, candles, fairy lights, a moonlit window (five since the follow-up batch, looking out on a whole night landscape), a lounge nook, warm pooled light and a lights-off mode lit by the fire.
- **The TV.** A console TV that plays the shared YouTube clip in the room, falling back to a corner player where a browser can't.
- **Performance (M10).** The join screen loads 5x less up front, the room preloads behind it, and updates are delta-only. A six-player load test runs at ~13 KB/s per player, and the room renders at 60 fps.
- **Cross-browser tests.** Playwright smoke tests run in Chromium, Firefox and WebKit, and in Edge on demand. They closed M9's missing browser pass and caught two real WebKit bugs.
- **A visual QA and polish pass.** In-game controls match the join screen, the session menu collapses, and the bare table is aged parchment. The room's lighting, shield and chandelier were fixed.

Earlier this day:
- Six color-coded animated characters with a live preview on the join screen (eight since the follow-up batch).
- A square true-color map table with crop and grid.
- A synced whiteboard.
- Real d4–d20 dice.
- Chat with `/roll` and speech bubbles.
- Pings.
- A four-player convergence test.

**Deployed** (same day): one sandboxed Docker container on the owner's VPS, live at `https://tabletop.murri.me`. It's open to anyone with the link, with upload safeguards. See [engineering/deployment.md](engineering/deployment.md).

**Saved tables** (same day): tables survive restarts and deploys, and a table everyone has left waits 7 days for its host to reopen it with the same code or the host link.

**The follow-up batch** (same night, [changelog.md](changelog.md)):
- The TV's clip is synced: anyone pauses, plays or seeks for everyone.
- Tables of eight.
- A mini of your character to move on the map, and dice you drag.
- The host's secret dice.
- Host controls: lock, remove, permissions, clearing.
- A soundboard that looks like furniture.
- Four more windows onto a living 3D night with true depth.
- A Halloween toggle for the whole room.
- A polished HUD.

**Then** (same night): drawing no longer lags (both screens held ~7 fps while someone drew; now 60), the host prepares several maps and puts one on the table at a time, and the night outside can be heard through the windows.

**And then:**
- the TV sits on a carved sideboard at eye level;
- anyone moves anyone's mini or dice;
- the table has as many chairs as players (four at least);
- a quality pass replaced the room's weakest models.

**Gadgets** (a colleague's work, reviewed and fixed the same night): a chest in the room holds a Polaroid camera, a flashlight, two walkie-talkies and a calculator. Each player holds one of them at a time, visible in their avatar's hand, and uses it with R:
- the camera's photos are pinned to a wall pinboard for everyone;
- the flashlight lights the room where its holder looks;
- the walkies carry messages only the two holders hear;
- the calculator is a pocket four-function one.

Nothing on the roadmap is left. What's next is whatever playtesting turns up, plus the "later" list in [roadmap.md](roadmap.md): map presets, wall drawing, fog of war, an initiative tracker.

### Earlier on 2026-09-25

Milestones 1–9 plus the change requests and first extras were done; Milestone 10 and the cross-browser pass remained.

### Before this round (2026-09-24)

**Milestones 1-9 done, plus a file-uploads extension on top of M5/M7.** The npm-workspace toolchain, sessions/connection (join, live player list, host role, reconnect), the 3D room shell (a real Blender-built "cozy tabletop game room" with a round table, first-person WASD + mouse-look movement, wall/table collision), player avatars (other connected players render as placeholder capsules and move live), the tabletop map/drawing (the host swaps the table's background image — by URL or file upload — any player draws directly on the physical table surface, both live for everyone), dice (any player spawns/rolls/removes a die, server-authoritative result, animated and visible to everyone live), soundboard/mute (the host triggers a sound everyone hears — a small built-in set or a file any player uploaded to the shared board; a player's self- or host-applied mute status is visible to the group), room interactables (a light switch, a full-screen sit-down mode at the table with a pen/eraser drawing toolbar, and a physical clickable soundboard console), and host authority hardening (every host-gated action now has live, proven server-side rejection coverage — an audit pass, not a new feature) all work end to end — see [roadmap.md](roadmap.md) for exactly what each milestone covers and [changelog.md](changelog.md) for how they were built. Remaining: Milestone 10 (performance & polish), the last milestone on the original roadmap. **Known gap:** Milestone 9's cross-browser pass (Edge, Firefox) was never actually performed — this environment's tooling only drives Chrome.

The player-experience direction — a walkable 3D room rather than a flat 2D map with 3D accents — was settled early (full reasoning in [decisions.md](decisions.md)) and everything since has built toward it.

The original design/technical specification is captured in [docs/engineering/architecture.md](engineering/architecture.md), along with the room extension decided this session.

## Non-goals (for now)

- No native desktop client.
- No mobile/touch-optimized layout.
- No campaign management beyond saved tables: a table survives restarts and waits 7 days for its host (decisions.md, "Saved tables"), but there are no named saves or exports.
- No voice/video — only a mute/unmute signal for a soundboard, per the spec.

[roadmap.md](roadmap.md) has the milestone plan, [changelog.md](changelog.md) the session-by-session history, and [decisions.md](decisions.md) the reasoning behind non-obvious choices.
