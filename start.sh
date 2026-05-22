#!/usr/bin/env bash
# Lumen launcher — runs the Codex bridge + a static file server, both bound to
# 127.0.0.1. Ctrl-C tears down both.

set -euo pipefail

cd "$(dirname "$0")"

WEB_HOST="${LUMEN_WEB_HOST:-127.0.0.1}"
WEB_PORT="${LUMEN_WEB_PORT:-5173}"
BRIDGE_HOST="${LUMEN_CODEX_HOST:-127.0.0.1}"
BRIDGE_PORT="${LUMEN_CODEX_PORT:-8787}"

if ! command -v node >/dev/null 2>&1; then
  echo "[lumen] node is required but was not found in PATH" >&2
  exit 1
fi
if ! command -v codex >/dev/null 2>&1; then
  echo "[lumen] codex CLI not found in PATH — install codex first" >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "[lumen] python3 is required for the static server" >&2
  exit 1
fi

pids=()
cleanup() {
  trap - INT TERM EXIT
  for pid in "${pids[@]:-}"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "[lumen] starting Codex bridge on http://${BRIDGE_HOST}:${BRIDGE_PORT}"
LUMEN_CODEX_HOST="$BRIDGE_HOST" LUMEN_CODEX_PORT="$BRIDGE_PORT" \
  node codex-bridge.mjs &
pids+=("$!")

echo "[lumen] starting static server on http://${WEB_HOST}:${WEB_PORT}"
python3 -m http.server "$WEB_PORT" --bind "$WEB_HOST" >/dev/null &
pids+=("$!")

sleep 0.4
echo ""
echo "[lumen] open http://${WEB_HOST}:${WEB_PORT}/  (Ctrl-C to stop)"
echo ""

# macOS ships bash 3.2 which lacks `wait -n`; poll instead.
while :; do
  for pid in "${pids[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "[lumen] child $pid exited — shutting down"
      exit 1
    fi
  done
  sleep 1
done
