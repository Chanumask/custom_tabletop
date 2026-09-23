---
name: sanity-check
description: Run the lint/format check and test suite for whatever's changed in this repo. Use this after any code change, and always immediately before running git commit — never commit code without running this first. Also use it standalone to verify the project is currently clean.
---

# Sanity Check

Operationalizes the "Sanity work" section of [CLAUDE.md](../../../CLAUDE.md): quality checks happen automatically, without being asked, every time code changes. Exact commands, ports, and gotchas: [docs/engineering/tooling.md](../../../docs/engineering/tooling.md).

## What to run

From the repo root (npm workspaces: `shared`, `server`, `client`):

1. **`npm run lint`** — ESLint across the whole repo. Fix, don't suppress, unless there's a documented reason.
2. **`npm run format:check`** — Prettier. Formatting is not up for debate per-file; run `npm run format` to fix.
3. **`npm run build`** — type-checks every workspace (`tsc --noEmit`), and bundles `client` (`vite build`). No type errors.
4. **`npm test`** — Vitest, every workspace. Every test must pass.
5. **`shared` changes** → re-run `server` and `client`'s build/test too, since both consume it as source and a break there can fail either silently.
6. **A test that's the proof of a specific exit check** (e.g. the M1 WebSocket round-trip test) → do one break-round when writing it: break the behavior, confirm the test fails, restore, confirm it passes again. Not needed for every change, just for tests whose entire job is proving something works.

## Sequence

1. Run the checks above that apply. Anything reported gets fixed — don't proceed with warnings left outstanding.
2. Run them again right before `git commit` if anything changed since.

## Why both passes

The first pass catches issues while context is fresh. The second catches anything introduced by the fixes themselves.
