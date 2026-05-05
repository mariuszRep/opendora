#!/usr/bin/env bash
set -u
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$SKILL_DIR/.venv"
missing=0

if [ ! -f "$VENV/bin/python" ]; then
  printf 'missing python venv: run scripts/install-dependencies.sh\n'
  missing=1
else
  "$VENV/bin/python" - <<'PY'
import importlib.util
missing = [name for name in ('openpyxl', 'pandas') if importlib.util.find_spec(name) is None]
if missing:
    print('missing python packages in venv: ' + ', '.join(missing))
    raise SystemExit(1)
print('python spreadsheet packages available in venv')
PY
  [ "$?" -ne 0 ] && missing=1
fi

node -e "require.resolve('xlsx')" >/dev/null 2>&1 || printf 'optional node package not found: xlsx\n'
command -v libreoffice >/dev/null 2>&1 || printf 'optional native command not found: libreoffice\n'
command -v soffice >/dev/null 2>&1 || printf 'optional native command not found: soffice\n'

if [ "$missing" -eq 0 ]; then
  printf 'spreadsheet-generation required dependencies available\n'
else
  printf 'fix: run scripts/install-dependencies.sh\n'
fi
exit "$missing"
