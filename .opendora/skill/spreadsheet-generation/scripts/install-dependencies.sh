#!/usr/bin/env bash
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Per-skill Python venv
VENV="$SKILL_DIR/.venv"
if [ ! -f "$VENV/bin/python" ]; then
  printf 'creating Python venv at %s\n' "$VENV"
  python3 -m venv "$VENV"
fi
"$VENV/bin/pip" install --upgrade pip --quiet
"$VENV/bin/pip" install openpyxl pandas

# Node packages
if command -v bun >/dev/null 2>&1; then
  bun add xlsx
elif command -v npm >/dev/null 2>&1; then
  npm install xlsx
else
  printf 'optional Node package xlsx not installed: install bun or npm\n'
fi

printf 'Optional for recalculation/PDF export: install LibreOffice.\n'
printf 'Python interpreter for this skill: %s/bin/python\n' "$VENV"
