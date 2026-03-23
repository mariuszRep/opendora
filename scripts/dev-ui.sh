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

bun run serve </dev/null &
pids+=($!)

bun run --cwd packages/ui dev </dev/null &
pids+=($!)

wait -n "${pids[@]}"
