#!/usr/bin/env bash
set -u
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$SKILL_DIR/.venv"
missing=0

node -e "require.resolve('pdf-lib')" >/dev/null 2>&1 || {
  printf 'missing node package: pdf-lib\n'
  missing=1
}
node -e "require.resolve('@pdf-lib/fontkit')" >/dev/null 2>&1 || printf 'optional node package not found: @pdf-lib/fontkit\n'

if [ ! -f "$VENV/bin/python" ]; then
  printf 'missing python venv: run scripts/install-dependencies.sh\n'
  missing=1
else
  "$VENV/bin/python" - <<'PY'
import importlib.util
required = ('pypdf', 'pdfplumber', 'reportlab')
missing = [name for name in required if importlib.util.find_spec(name) is None]
if missing:
    print('missing python packages in venv: ' + ', '.join(missing))
    raise SystemExit(1)
print('python PDF packages available in venv')
PY
  [ "$?" -ne 0 ] && missing=1
fi

for cmd in libreoffice soffice qpdf pdftotext pdfinfo pdftoppm tesseract; do
  command -v "$cmd" >/dev/null 2>&1 || printf 'optional native command not found: %s\n' "$cmd"
done

if [ "$missing" -eq 0 ]; then
  printf 'pdf-processing required dependencies available\n'
else
  printf 'fix: run scripts/install-dependencies.sh\n'
fi
exit "$missing"
