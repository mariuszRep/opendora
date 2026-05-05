#!/usr/bin/env bash
set -u
missing=0
check_node_pkg() {
  local pkg="$1"
  node -e "require.resolve('${pkg}')" >/dev/null 2>&1 || {
    printf 'missing node package: %s\n' "$pkg"
    missing=1
  }
}
check_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || printf 'optional native command not found: %s\n' "$cmd"
}
check_node_pkg docx
check_node_pkg docxtemplater
check_node_pkg pizzip
check_cmd libreoffice
check_cmd soffice
if [ "$missing" -eq 0 ]; then
  printf 'document-generation required dependencies available\n'
else
  printf 'install required Node packages: bun add docx docxtemplater pizzip\n'
fi
exit "$missing"
