#!/usr/bin/env bash
# Runs ON THE VPS, sent over SSH by scripts/deploy.mjs (never run locally).
# Arguments: <commit> <app dir>. The commit's source has already been
# unpacked into <app dir>/src.new. Only touches <app dir> and the `tabletop`
# compose project. Details: docs/engineering/deployment.md.
set -euo pipefail
COMMIT="$1"
APP_DIR="$2"

rm -rf "$APP_DIR/src"
mv "$APP_DIR/src.new" "$APP_DIR/src"
echo "$COMMIT" > "$APP_DIR/src/REVISION"
mkdir -p "$APP_DIR/uploads" "$APP_DIR/tables"
# The container's own uid (compose `user:`) owns what it writes.
chown -R 10001:10001 "$APP_DIR/uploads" "$APP_DIR/tables"
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
