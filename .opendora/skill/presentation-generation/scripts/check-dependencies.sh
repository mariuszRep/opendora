#!/usr/bin/env bash
set -u
missing=0
node -e "require.resolve('pptxgenjs')" >/dev/null 2>&1 || {
  printf 'missing node package: pptxgenjs\n'
  missing=1
}
node -e "require.resolve('sharp')" >/dev/null 2>&1 || printf 'optional node package not found: sharp\n'
command -v libreoffice >/dev/null 2>&1 || printf 'optional native command not found: libreoffice\n'
command -v soffice >/dev/null 2>&1 || printf 'optional native command not found: soffice\n'
if [ "$missing" -eq 0 ]; then
  printf 'presentation-generation required dependencies available\n'
else
  printf 'install required Node packages: bun add pptxgenjs\n'
fi
exit "$missing"
