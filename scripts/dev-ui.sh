#!/usr/bin/env bash

set -euo pipefail
set -m # each background job gets its own process group, so we can kill its whole tree

pids=()

cleanup() {
  local status=$?

  for pid in "${pids[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      # negative PID = signal the whole process group, catching children
      # (e.g. `next dev` -> `next-server`) that would otherwise be orphaned
      kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    fi
  done

  wait "${pids[@]:-}" 2>/dev/null || true
  exit "$status"
}

trap cleanup EXIT INT TERM

# Kill any stale process on port 4097 before starting
stale_pid=$(lsof -t -i :4097 2>/dev/null || true)
if [ -n "$stale_pid" ]; then
  echo "Killing stale process on port 4097 (PID $stale_pid)…"
  kill "$stale_pid" 2>/dev/null || true
  sleep 1
fi

PROJECTFLOWS_PROJECT_ROOT="$PWD" \
PROJECTFLOWS_CONFIG_DIR="$HOME/.projectflows" \
bun run apps/cli/src/index.ts serve --port 4097 --hostname 0.0.0.0 </dev/null &
pids+=($!)

echo "Waiting for backend on port 4097…"
until curl -s -o /dev/null http://localhost:4097/health 2>/dev/null; do sleep 0.5; done
echo "Backend ready."

bun run --cwd apps/web dev --hostname 0.0.0.0 </dev/null &
pids+=($!)

wait -n "${pids[@]}"
