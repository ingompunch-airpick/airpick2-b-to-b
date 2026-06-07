#!/bin/bash
# Cursor sessionStart: auto-start npm run dev when this project opens.
set -euo pipefail

cat >/dev/null

export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.nvm/versions/node/$(ls "${HOME}/.nvm/versions/node" 2>/dev/null | tail -1 2>/dev/null)/bin:${PATH}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [ ! -f package.json ] || ! grep -q '"dev"' package.json; then
  exit 0
fi

if ! command -v npm >/dev/null 2>&1; then
  exit 0
fi

LOG_FILE="$ROOT/.cursor/dev-server.log"
mkdir -p "$(dirname "$LOG_FILE")"

is_dev_server_up() {
  curl -sf --max-time 2 http://localhost:3000 >/dev/null 2>&1
}

if is_dev_server_up; then
  exit 0
fi

if lsof -ti :3000 >/dev/null 2>&1; then
  lsof -ti :3000 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

nohup npm run dev >>"$LOG_FILE" 2>&1 &
disown

exit 0
