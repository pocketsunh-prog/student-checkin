#!/bin/sh
# Container entrypoint: wait for MySQL, apply migrations, seed (idempotent),
# then start the API.
set -e

WAIT_ATTEMPTS=0
WAIT_MAX=90

echo "[entrypoint] waiting for the database..."
until node -e '
const net = require("node:net");
const { URL } = require("node:url");
let host = "mysql";
let port = 3306;
try {
  const url = new URL(process.env.DATABASE_URL || "");
  if (url.hostname) host = url.hostname;
  if (url.port) port = Number(url.port);
} catch {}
const socket = net.connect({ host, port });
socket.setTimeout(3000, () => { socket.destroy(); process.exit(1); });
socket.on("connect", () => { socket.end(); process.exit(0); });
socket.on("error", () => process.exit(1));
'; do
  WAIT_ATTEMPTS=$((WAIT_ATTEMPTS + 1))
  if [ "$WAIT_ATTEMPTS" -ge "$WAIT_MAX" ]; then
    echo "[entrypoint] database not reachable after ${WAIT_MAX} attempts"
    exit 1
  fi
  sleep 1
done

echo "[entrypoint] applying database migrations..."
./node_modules/.bin/prisma migrate deploy

echo "[entrypoint] seeding database (idempotent)..."
./node_modules/.bin/tsx prisma/seed.ts

echo "[entrypoint] starting API..."
exec node dist/server.js
