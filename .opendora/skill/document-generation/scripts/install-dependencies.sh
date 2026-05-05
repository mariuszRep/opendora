#!/usr/bin/env bash
set -euo pipefail
if command -v bun >/dev/null 2>&1; then
  bun add docx docxtemplater pizzip
elif command -v npm >/dev/null 2>&1; then
  npm install docx docxtemplater pizzip
else
  printf 'missing package manager: install bun or npm\n' >&2
  exit 1
fi
printf 'Optional for PDF export: install LibreOffice (soffice/libreoffice).\n'
