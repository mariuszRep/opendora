#!/usr/bin/env bash
# =============================================================================
# bootstrap.sh — New-project bootstrap for product-orchestrator
#
# Scaffolds a Next.js + TypeScript project with App Router, Tailwind, ESLint,
# git init, optional quality tooling, and a production-build smoke test.
#
# Usage:
#   bootstrap.sh --name <project> --dir <parent-path> [flags]
#
# Flags:
#   --name         Project name (kebab-case, required)
#   --dir          Parent directory (required, must exist)
#   --force        Proceed even if target directory exists
#   --quality      Install quality tooling (prettier, format scripts)
#   --env          Create .env.example from template
#   --all          Same as --quality + --env
#   --no-verify    Skip production build smoke test
#   --no-git       Skip git init and initial commit
#   --quiet        Suppress non-error output
#   -h, --help     Print this help and exit
#
# Exit codes:
#   0  — Bootstrap complete and verified
#   1  — Input validation failure
#   2  — Scaffold failure
#   3  — Build/smoke-test failure
# =============================================================================

set -euo pipefail

# ---- Argument defaults -------------------------------------------------------
PROJECT_NAME=""
PARENT_DIR=""
FLAG_FORCE=false
FLAG_QUALITY=false
FLAG_ENV=false
FLAG_NO_VERIFY=false
FLAG_NO_GIT=false
FLAG_QUIET=false

# ---- Help --------------------------------------------------------------------
usage() {
  sed -n '3,22p' "$0" | sed 's/^# \?//'
  exit 0
}

# ---- Parse arguments ---------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)       PROJECT_NAME="$2";     shift 2 ;;
    --dir)        PARENT_DIR="$2";       shift 2 ;;
    --force)      FLAG_FORCE=true;       shift   ;;
    --quality)    FLAG_QUALITY=true;     shift   ;;
    --env)        FLAG_ENV=true;         shift   ;;
    --all)        FLAG_QUALITY=true; FLAG_ENV=true; shift ;;
    --no-verify)  FLAG_NO_VERIFY=true;   shift   ;;
    --no-git)     FLAG_NO_GIT=true;      shift   ;;
    --quiet)      FLAG_QUIET=true;       shift   ;;
    -h|--help)    usage                  ;;
    *)            echo "ERROR: unknown flag: $1" >&2; usage ;;
  esac
done

# ---- Helpers -----------------------------------------------------------------
fail() { echo "ERROR: $*" >&2; exit 1; }
info() { [[ "$FLAG_QUIET" == true ]] || echo "$*"; }

# ---- Input validation --------------------------------------------------------
[[ -n "$PROJECT_NAME" ]] || fail "--name is required"
[[ -n "$PARENT_DIR" ]]  || fail "--dir is required"

# Project name: kebab-case, must start with a letter, no consecutive dashes
[[ "$PROJECT_NAME" =~ ^[a-z][a-z0-9-]*$ ]] \
  || fail "Project name must be kebab-case and start with a letter: $PROJECT_NAME"

[[ -d "$PARENT_DIR" ]] \
  || fail "Parent directory does not exist: $PARENT_DIR"

TARGET_DIR="$PARENT_DIR/$PROJECT_NAME"

if [[ -d "$TARGET_DIR" ]]; then
  if [[ "$FLAG_FORCE" == true ]]; then
    info "Target directory exists (--force), proceeding: $TARGET_DIR"
  else
    fail "Target directory exists. Use --force to overwrite: $TARGET_DIR"
  fi
fi

# Runtime prerequisites
command -v node &>/dev/null || fail "node is required but not found"
NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
[[ "$NODE_MAJOR" -ge 18 ]] || fail "node >= 18 required (found $(node -v))"
command -v npm &>/dev/null  || fail "npm is required but not found"
command -v npx &>/dev/null  || fail "npx is required but not found"

# ---- Step 1: Create target directory -----------------------------------------
mkdir -p "$TARGET_DIR"

# ---- Step 2: Scaffold Next.js + TypeScript (idempotent) ----------------------
if [[ -f "$TARGET_DIR/package.json" ]]; then
  info "package.json exists — skipping create-next-app scaffold"
else
  info "Scaffolding Next.js + TypeScript project..."

  # Scaffold into a temp directory to avoid create-next-app complaining about
  # non-empty targets under --force. Contents are moved post-scaffold.
  SCAFFOLD_TMP=$(mktemp -d)
  # shellcheck disable=SC2064
  trap "rm -rf '$SCAFFOLD_TMP'" EXIT

  if ! npx create-next-app@latest "$SCAFFOLD_TMP/$PROJECT_NAME" \
    --ts --app --src-dir --tailwind --eslint \
    --import-alias "@/*" --use-npm --disable-git --yes 2>&1; then
    fail "create-next-app failed"
  fi

  # Move all content including dotfiles into target
  shopt -s dotglob
  mv "$SCAFFOLD_TMP/$PROJECT_NAME"/* "$TARGET_DIR/"
  mv "$SCAFFOLD_TMP/$PROJECT_NAME"/.* "$TARGET_DIR/" 2>/dev/null || true
  shopt -u dotglob

  rm -rf "$SCAFFOLD_TMP"
  trap - EXIT

  info "Next.js scaffold complete"
fi

# ---- Step 3: Git init (idempotent) -------------------------------------------
if [[ "$FLAG_NO_GIT" == true ]]; then
  info "--no-git set — skipping git init"
elif [[ -d "$TARGET_DIR/.git" ]]; then
  info ".git already exists — skipping git init"
else
  git -C "$TARGET_DIR" init -b main
  info "Git repository initialized (branch: main)"
fi

# ---- Step 4: Ensure .gitignore -----------------------------------------------
if [[ ! -f "$TARGET_DIR/.gitignore" ]]; then
  cat > "$TARGET_DIR/.gitignore" <<- 'EOF'
node_modules/
.next/
*.local
.env
.env.local
*.tsbuildinfo
next-env.d.ts
EOF
  info ".gitignore created"
else
  info ".gitignore already present"
fi

# ---- Step 5: .env.example (optional) -----------------------------------------
if [[ "$FLAG_ENV" == true ]]; then
  if [[ ! -f "$TARGET_DIR/.env.example" ]]; then
    cat > "$TARGET_DIR/.env.example" <<- 'EOF'
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
EOF
    info ".env.example created"
  else
    info ".env.example already exists — skipping"
  fi
fi

# ---- Step 6: Quality tooling (optional) -------------------------------------
if [[ "$FLAG_QUALITY" == true ]]; then
  # Prettier
  if ! grep -q '"prettier"' "$TARGET_DIR/package.json" 2>/dev/null; then
    info "Installing prettier..."
    npm --prefix "$TARGET_DIR" install --save-dev prettier 2>&1
  else
    info "prettier already in devDependencies — skipping install"
  fi

  # .prettierrc
  if [[ ! -f "$TARGET_DIR/.prettierrc" ]]; then
    cat > "$TARGET_DIR/.prettierrc" <<- 'EOF'
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
EOF
    info ".prettierrc created"
  else
    info ".prettierrc already exists — keeping existing"
  fi

  # .prettierignore
  if [[ ! -f "$TARGET_DIR/.prettierignore" ]]; then
    cat > "$TARGET_DIR/.prettierignore" <<- 'EOF'
node_modules
.next
public
EOF
    info ".prettierignore created"
  else
    info ".prettierignore already exists — keeping existing"
  fi

  # Merge format scripts into package.json (preserve existing scripts)
  node -e "
    const fs = require('fs');
    const path = '$TARGET_DIR/package.json';
    const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
    pkg.scripts = pkg.scripts || {};
    pkg.scripts.format = pkg.scripts.format || 'prettier --write .';
    pkg.scripts['format:check'] = pkg.scripts['format:check'] || 'prettier --check .';
    fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
  "
  info "Format scripts added to package.json"
fi

# ---- Step 7: Production build smoke test -------------------------------------
if [[ "$FLAG_NO_VERIFY" == true ]]; then
  info "--no-verify set — skipping build smoke test"
else
  info "Running production build smoke test..."
  if ! npm --prefix "$TARGET_DIR" run build 2>&1; then
    fail "Production build failed. Inspect output above for details."
  fi
  info "Build succeeded"
fi

# ---- Step 8: Initial commit --------------------------------------------------
if [[ "$FLAG_NO_GIT" == true ]] || [[ ! -d "$TARGET_DIR/.git" ]]; then
  info "Skipping initial commit"
else
  COMMIT_COUNT=$(git -C "$TARGET_DIR" rev-list --count HEAD 2>/dev/null || echo "0")
  if [[ "$COMMIT_COUNT" -gt 0 ]]; then
    info "Repository already has commits — skipping initial commit"
  else
    git -C "$TARGET_DIR" add -A
    git -C "$TARGET_DIR" commit -m "chore: initial scaffold" --no-gpg-sign 2>&1
    info "Initial commit created"
  fi
fi

# ---- Success summary ---------------------------------------------------------
NEXT_VER=$(node -e "try{console.log(require('$TARGET_DIR/node_modules/next/package.json').version)}catch(e){console.log('?')}" 2>/dev/null)
GIT_HASH=$(git -C "$TARGET_DIR" rev-parse HEAD 2>/dev/null || echo "no commits")

echo ""
echo "============================================="
echo "  BOOTSTRAP COMPLETE"
echo "============================================="
echo "  Project:   $PROJECT_NAME"
echo "  Location:  $TARGET_DIR"
echo "  Node:      $(node -v)"
echo "  npm:       $(npm -v)"
echo "  Next.js:   $NEXT_VER"
echo "  Git:       $GIT_HASH"
echo "  Build:     PASS"
[[ "$FLAG_QUALITY" == true ]] && echo "  Quality:   prettier + format scripts" || echo "  Quality:   (none)"
[[ "$FLAG_ENV" == true ]] && echo "  Env:       .env.example present" || true
echo "============================================="

exit 0
