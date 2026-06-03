#!/usr/bin/env bash

set -euo pipefail

pids=()

cleanup() {
  local status=$?

  for pid in "${pids[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done

  wait "${pids[@]:-}" 2>/dev/null || true
  exit "$status"
}

trap cleanup EXIT INT TERM

LD_PRELOAD="$PWD/packages/tools/desktop/x11_nocrash.so" \
OPENCODE_PROJECT_ROOT="$PWD" \
OPENCODE_CONFIG_DIR="$HOME/.projectflows" \
bun run packages/opencode/src/index.ts serve --port 4097 --hostname 0.0.0.0 </dev/null &
pids+=($!)

echo "Waiting for backend on port 4097…"
until curl -s -o /dev/null http://localhost:4097/health 2>/dev/null; do sleep 0.5; done
echo "Backend ready."

bun run --cwd ui/web dev --hostname 0.0.0.0 </dev/null &
pids+=($!)

wait -n "${pids[@]}"
