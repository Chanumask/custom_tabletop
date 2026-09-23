---
name: sanity-check
description: Run the lint/format check and test suite for whatever's changed in this repo. Use this after any code change, and always immediately before running git commit — never commit code without running this first. Also use it standalone to verify the project is currently clean.
---

# Sanity Check

Operationalizes the "Sanity work" section of [CLAUDE.md](../../../CLAUDE.md): quality checks happen automatically, without being asked, every time code changes.

## What to run

Stack is Node.js + TypeScript across `client/`, `server/`, `shared/` (npm workspaces, from Milestone 1 onward — nothing to run before that exists).

1. **ESLint** on every changed file (`npm run lint`, or the workspace-scoped equivalent). Fix, don't suppress, unless there's a documented reason.
2. **Prettier** (`npm run format` / `--check` in CI-style mode) — formatting is not up for debate per-file.
3. **TypeScript build** (`npm run build` or `tsc --noEmit` per workspace) — no type errors.
4. **Tests** (`npm test`, Vitest once set up) — every test must pass, for every workspace touched by the change.
5. **Shared-package changes** (`shared/`): re-run both `client` and `server` builds/tests, since both consume it — a change there can break either silently.

If the exact scripts differ from the above once the toolchain is actually set up in Milestone 1, update this file to match rather than letting it drift from what `package.json` really runs.

## Sequence

1. Run the checks above that apply. Anything reported gets fixed — don't proceed with warnings left outstanding.
2. Run them again right before `git commit` if anything changed since the first pass.

## Why both passes

The first pass catches issues while context is fresh. The second catches anything introduced by the fixes themselves.
