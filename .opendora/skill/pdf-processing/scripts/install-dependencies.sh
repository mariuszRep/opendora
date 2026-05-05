#!/usr/bin/env bash
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Node packages
if command -v bun >/dev/null 2>&1; then
  bun add pdf-lib @pdf-lib/fontkit
elif command -v npm >/dev/null 2>&1; then
  npm install pdf-lib @pdf-lib/fontkit
else
  printf 'missing package manager: install bun or npm\n' >&2
  exit 1
fi

# Per-skill Python venv
VENV="$SKILL_DIR/.venv"
if [ ! -f "$VENV/bin/python" ]; then
  printf 'creating Python venv at %s\n' "$VENV"
  python3 -m venv "$VENV"
fi
"$VENV/bin/pip" install --upgrade pip --quiet
"$VENV/bin/pip" install pypdf pdfplumber reportlab pytesseract

printf 'Optional native tools: install LibreOffice, Poppler (pdftotext/pdfinfo/pdftoppm), qpdf, Tesseract OCR.\n'
printf 'Python interpreter for this skill: %s/bin/python\n' "$VENV"
