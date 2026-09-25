# Tooling

← [CLAUDE.md](../../CLAUDE.md) · [engineering index](README.md)

The exact commands behind `CLAUDE.md`'s "Sanity work" section and the `sanity-check` skill, set up in Milestone 1. npm workspaces: `shared`, `server`, `client` (in that dependency order).

## Prerequisite

**Node.js 24 (LTS)**, installed via winget (`OpenJS.NodeJS.LTS`) on 2026-09-23. `.nvmrc` pins the major version. `npm install` at the repo root installs all three workspaces.

**Known environment gotcha (this machine):** installing Node.js updates the system `PATH`, but already-running shells — and any tool that spawns a *new* shell from a parent process that predates the install — won't see the update until that parent process itself restarts. If `node`/`npm` report "not found" right after an install that should have worked, this is why; open a genuinely new terminal window (not just a new command in an existing one) rather than re-diagnosing the install.

**Observed again 2026-09-23 (M3 part 2), in a fresh session's Bash/PowerShell tool shells specifically** (not right after an install): `npm`/`node` were not on `PATH` even in brand-new tool-spawned shells. Node itself was present and working (`C:\Program Files\nodejs\node.exe`) — just not on that particular shell's `PATH`. Workaround, no restart needed: prepend it for the session, e.g. in PowerShell `$env:PATH = "C:\Program Files\nodejs;" + $env:PATH` before `npm`/`node` commands. Cause not fully diagnosed (possibly the tool shells don't source the profile that sets `PATH`) — if `npm`/`node` "not found" recurs, try this before assuming a reinstall is needed.

## Commands

Run from the repo root unless noted; each fans out to whichever workspaces define the script (`--workspaces --if-present`).

| Command | What it does |
|---|---|
| `npm install` | Install all workspace dependencies |
| `npm run dev` | Runs `server` (`tsx watch`, port 3001) and `client` (Vite, port 5173) together via `concurrently` |
| `npm run build` | Type-checks `shared` and `server` (`tsc --noEmit`), type-checks and bundles `client` (`tsc --noEmit && vite build`) |
| `npm run lint` | ESLint (flat config, `eslint.config.js`) across the whole repo |
| `npm run format` / `npm run format:check` | Prettier, write or check-only |
| `npm test` | Vitest, `run` mode, per workspace |
| `npm run test:e2e` | Playwright cross-browser smoke tests (`e2e/`) in Chromium, Firefox and WebKit against the real app; starts the dev server + client itself, or reuses running ones. First time on a machine: `npx playwright install`. On Windows the Chromium project runs headless on the real GPU (`--use-angle=d3d11`) — SwiftShader is too slow for the room. Edge isn't a fixed project (not every machine has it); to include it, run with a throwaway config that spreads `playwright.config.ts` and adds `{ name: 'edge', use: { channel: 'msedge' } }` |
| `npm run bundle -w server`, then `npm start -w server` | The production server: an esbuild bundle (`server/dist/index.js`) run with plain Node. Set `CLIENT_DIST=client/dist` (after `npm run build -w client`) to serve the built client from the same port. Env vars: [deployment.md](deployment.md) |
| `npm run deploy` | Deploys the committed HEAD to the VPS (`scripts/deploy.mjs`; `npm run deploy -- <commit>` for a specific one). Works from PowerShell, cmd and Git Bash. See [deployment.md](deployment.md) |
| `E2E_BASE_URL=<url> npx playwright test` | Runs the smoke tests against an already-running app (a local production build, or the live site) instead of starting the dev servers |
| `npm run load-test` | Six simulated players against a running server (`scripts/load-test.ts`): message sizes, per-player traffic, ack latency, server CPU |

Scoped to one workspace: `npm run <script> -w server` (or `-w client`, `-w shared`).

## Ports

- **Server:** `3001` (override via `PORT` env var). REST health check at `/health`; Socket.IO on the same HTTP server.
- **Saved tables in dev:** the dev server saves tables to `server/data/tables` (gitignored), so they survive its restarts. Delete that folder to start clean.
- **Client:** `5173` (Vite default). Reads the server URL from `VITE_SERVER_URL` (see `client/.env.example`), defaulting to `http://localhost:3001`.

## How `shared` is consumed

`shared`'s `package.json` points `main`/`types` straight at `src/index.ts` — **no build step**. `server` (via `tsx`, which resolves a `./foo.js` import to a sibling `foo.ts`, the same convention TypeScript's `NodeNext` resolution uses) and `client` (via Vite/esbuild, which resolves the same way) both consume it as TypeScript source directly through the npm-workspace symlink in `node_modules`. Verified working 2026-09-23: `shared`'s own build/test pass, and both `server` and `client` type-check and run against it with no separate compile step. See `docs/decisions.md` for why TS project references (`tsc -b`) were tried and dropped in favor of this.

## Known accepted state

`npm audit` reports vulnerabilities in `vite`/`esbuild`/`vitest`'s dev-server-only code paths (moderate-to-critical severity, but scoped to accepting arbitrary requests against a *local dev server* — not a production runtime risk for this project, which has no production build serving through Vite's dev server). Fixing requires major version bumps (`vite@8`, `vitest@5`) that are a breaking-change upgrade, out of scope for Milestone 1. **Re-checked at deployment (2026-09-25):** `npm audit --omit=dev` reports 0 vulnerabilities, and the deployed image contains only the server's production dependencies. It runs no Vite dev server, so these findings don't reach the live site. The upgrade is parked in roadmap.md's "Later — in discussion" list.

## Test discipline

Same "why both passes" logic as the `sanity-check` skill: run the checks once while writing code, then again right before committing. For a test meant to *prove* something (like Milestone 1's WebSocket round-trip exit check in `server/src/server.test.ts`), also do a break-round once when you write it — temporarily break the behavior it claims to cover, confirm the test actually fails, then restore the fix. Not required for every test on every change, just for a test whose entire job is being the proof of a specific exit check.
