# Deployment

← [CLAUDE.md](../../CLAUDE.md) · [engineering index](README.md)

The game is served from **https://tabletop.murri.me** on the owner's VPS (`ssh root@murri.me`, Debian 12, Docker Compose). The decision and its reasoning are in [decisions.md](../decisions.md), 2026-09-25 "Deployment".

**Status (2026-09-25): live.** The container runs commit `0a0e8b4`, and the owner has created the NPM proxy host. All 9 cross-browser smoke runs pass against `https://tabletop.murri.me`.

## How it's put together

- **One container.** In production the Node server also serves the built client (`CLIENT_DIST`), so the page, `/uploads/*` and Socket.IO share one origin and one port (3001). The client talks to its own origin when built for production (`client/src/socket.ts`). In dev nothing changes: Vite on 5173, the server on 3001.
- **Image** (`Dockerfile`, multi-stage):
  1. The build stage runs `npm ci`, builds the client, and bundles the server (`npm run bundle -w server`, esbuild; `shared/` is bundled in and the four runtime packages stay external).
  2. The runtime stage is `node:24-alpine` with only the server's production dependencies, the bundle and `client/dist`, with a `/health` healthcheck. The image's default user is `node`; on the VPS it runs as uid 10001 (next point).
- **On the VPS** it follows the box's existing pattern: a compose project in `/srv/apps/tabletop/`, joined to the shared `murrinet` network. Nginx Proxy Manager (NPM) reaches it by service name as `http://tabletop:3001`, and no host port is published.
  ```
  /srv/apps/tabletop/
    docker-compose.yml   ← copied from deploy/docker-compose.yml on every deploy
    src/                 ← the deployed commit's source (REVISION holds the hash)
    uploads/             ← uploaded maps and sounds (volume, owned by uid 10001)
  ```
- **Sandboxed for a shared box** (critical services run next to it): its own uid (10001, no account on the VPS; the image's `node` user is uid 1000, which is an existing account there), 512 MB memory, 1 CPU, a PID limit, a read-only root filesystem (writes only to the uploads volume and a tmpfs `/tmp`), all capabilities dropped, no-new-privileges, and logs capped at 3 × 10 MB.

## Environment (set in `deploy/docker-compose.yml`)

| Variable | Meaning | Deployed value |
|---|---|---|
| `CLIENT_DIST` | Built client to serve (set in the image) | `/app/client/dist` |
| `UPLOADS_DIR` | Where uploads are stored (set in the image) | `/data/uploads` |
| `CORS_ORIGIN` | The only browser origin allowed to call the server | `https://tabletop.murri.me` |
| `TRUST_PROXY` | Express `trust proxy`, so the rate limit sees real client IPs behind NPM | `uniquelocal` |
| `UPLOADS_MAX_MB` | Upload storage cap | `2048` |
| `UPLOADS_MAX_AGE_HOURS` | Unused uploads older than this are deleted | `24` |

All unset in dev.

## Upload safeguards (the site is open to anyone with the link)

`server/src/uploadStorage.ts`, applied by `uploads.ts`:
- **Never deleted:** a file a live session uses, meaning its map or a soundboard sound (`SessionStore.referencedUploads`). Neither is a file younger than 10 minutes, since an upload is registered into its session a moment after it lands.
- **Deleted:** unused files older than 24 h, then the oldest unused files while the folder is over the cap. Sessions only live in memory, so an unused upload is unreachable garbage. This runs hourly, at startup, and whenever an upload finds the cap reached.
- **Refused:** new uploads get a clear 507 error while everything left is still in use and over the cap. Each IP also gets at most 30 uploads per 10 minutes (429).

## Deploying

```bash
npm run deploy               # = scripts/deploy.sh: deploys HEAD (committed state only)
scripts/deploy.sh <commit>   # a specific commit — also how to roll back
```

The script `git archive`s the commit's files over SSH, so **no push is needed** and exactly the tested commit goes out. It then swaps them into `src/`, runs `docker compose -p tabletop build` + `up -d`, and waits for the healthcheck. The first build takes a few minutes; later ones reuse the cached `npm ci` layer unless the lockfile changed. The script only touches `/srv/apps/tabletop` and the `tabletop` project.

Check a deploy against the live site with the cross-browser smoke tests:

```bash
E2E_BASE_URL=https://tabletop.murri.me npx playwright test
```

## Operations

Run these on the VPS, in `/srv/apps/tabletop`:

| Task | Command |
|---|---|
| Which commit is running | `cat src/REVISION` |
| Is it healthy | `docker compose -p tabletop ps` |
| Logs | `docker compose -p tabletop logs -f` |
| Stop | `docker compose -p tabletop down` |
| Start again | `docker compose -p tabletop up -d` |
| Upload usage | `du -sh uploads` |

- **Rolling back:** run `scripts/deploy.sh <older-commit>` from your machine. It rebuilds that commit, so a known-good one is always one command away.
- **A VPS reboot or Docker restart** brings the container back (`restart: unless-stopped`). Every table in progress is lost, because sessions live in memory; players just host again. Uploads survive on disk until the pruning rules remove them.
- **Uploads aren't backed up**, and don't need to be: they're only reachable from live sessions.

## Nginx Proxy Manager proxy host (set up once, by the owner)

NPM's admin UI (`127.0.0.1:81` on the VPS) needs the owner's login, so this step is manual. Proxy host `tabletop.murri.me`:
- **Details:** scheme `http`, forward hostname `tabletop`, port `3001`.
  - **Websockets Support: on.** Socket.IO needs it.
  - Block Common Exploits: on.
  - Cache Assets: off, because the server sets its own cache headers (hashed assets for a year, everything else revalidated).
- **SSL:** request a new Let's Encrypt certificate, then turn on Force SSL and HTTP/2.

The subdomain already resolves: `*.murri.me` is a wildcard A record to the VPS.

## Not touched

The rest of the VPS is left alone: the other compose projects, NPM's own config and data, `/srv/manage.sh` (it knows nothing about this app, so `./manage.sh all` doesn't touch it), and the `/srv` git repo. Removing the game entirely: `docker compose -p tabletop down`, then delete `/srv/apps/tabletop` and the `custom-tabletop` image. Delete the NPM proxy host too.
