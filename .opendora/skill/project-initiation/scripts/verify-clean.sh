#!/bin/bash
# verify-clean.sh - Verify clean working state before starting work

set -e

echo "=== Verifying Working Directory State ==="

# Check if we're in a git repo
if [ ! -d ".git" ]; then
    echo "Error: Not in a git repository. Run init-repo.sh first."
    exit 1
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "Warning: You have uncommitted changes:"
    git status --short
    echo ""
    echo "Options:"
    echo "  1. Commit changes:  git add -A && git commit -m 'message'"
    echo "  2. Stash changes:  git stash"
    echo "  3. Discard:        git reset --hard HEAD"
    echo ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 1
    fi
fi

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "✓ Current branch: $CURRENT_BRANCH"

# Check if branch is up to date with remote (if tracking)
TRACKING=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || true)
if [ -n "$TRACKING" ]; then
    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse "$TRACKING")
    
    if [ "$LOCAL" != "$REMOTE" ]; then
        echo "Warning: Branch is behind remote. Run: git pull"
    else
        echo "✓ Branch is up to date with remote"
    fi
fi

echo "=== Working Directory Clean ==="