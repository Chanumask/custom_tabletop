#!/usr/bin/env bash
# Deploys a commit of Custom Tabletop to the VPS (tabletop.murri.me).
#
#   scripts/deploy.sh            # deploys HEAD (committed state only)
#   scripts/deploy.sh <commit>   # deploys a specific commit
#
# Ships the commit's files over SSH (`git archive`, so no push is needed and
# exactly the tested commit goes out). On the VPS it only touches
# /srv/apps/tabletop and the `tabletop` compose project: unpacks the source
# into ./src, builds the image, restarts the one container and waits for it
# to report healthy. Nothing else on the box is changed.
# Details: docs/engineering/deployment.md.
set -euo pipefail

HOST="${DEPLOY_HOST:-root@murri.me}"
APP_DIR=/srv/apps/tabletop

COMMIT="$(git rev-parse "${1:-HEAD}^{commit}")"
if [ -z "${1:-}" ] && [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Note: uncommitted changes are not deployed — only $(git rev-parse --short HEAD)." >&2
fi
echo "Deploying $(git log --oneline -1 "$COMMIT") to $HOST"

git archive --format=tar "$COMMIT" \
  Dockerfile .dockerignore deploy package.json package-lock.json tsconfig.base.json \
  shared server client |
  ssh "$HOST" "rm -rf '$APP_DIR/src.new' && mkdir -p '$APP_DIR/src.new' && tar -x -C '$APP_DIR/src.new'"

ssh "$HOST" bash -s -- "$COMMIT" "$APP_DIR" <<'REMOTE'
set -euo pipefail
COMMIT="$1"; APP_DIR="$2"

rm -rf "$APP_DIR/src"
mv "$APP_DIR/src.new" "$APP_DIR/src"
echo "$COMMIT" > "$APP_DIR/src/REVISION"
mkdir -p "$APP_DIR/uploads"
chown -R 10001:10001 "$APP_DIR/uploads" # the container's own uid (compose `user:`)
cp "$APP_DIR/src/deploy/docker-compose.yml" "$APP_DIR/docker-compose.yml"

cd "$APP_DIR"
docker compose -p tabletop build
docker compose -p tabletop up -d

echo "Waiting for the container to report healthy..."
for _ in $(seq 1 30); do
  status="$(docker inspect -f '{{.State.Health.Status}}' tabletop-tabletop-1 2>/dev/null || true)"
  if [ "$status" = "healthy" ]; then
    echo "Healthy: running ${COMMIT:0:7}"
    # Only this project's old, now-untagged images.
    docker image prune --force --filter "label=com.docker.compose.project=tabletop" > /dev/null || true
    exit 0
  fi
  sleep 2
done
echo "Not healthy after 60 s — recent logs:" >&2
docker compose -p tabletop logs --tail 40 >&2
exit 1
REMOTE
