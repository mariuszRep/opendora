#!/bin/bash
# init-repo.sh - Initialize a new git repository with main branch

set -e

echo "=== Initializing Git Repository ==="

# Check if already in a git repo
if [ -d ".git" ]; then
    echo "Warning: Already in a git repository. Skipping init."
    exit 0
fi

# Initialize git
git init
echo "✓ Git initialized"

# Rename default branch to main
git branch -M main
echo "✓ Default branch set to 'main'"

# Check if remote URL was provided as argument
if [ -n "$1" ]; then
    git remote add origin "$1"
    echo "✓ Remote 'origin' added: $1"
    
    # Check if remote has content (has commits)
    if git ls-remote --exit-code origin main > /dev/null 2>&1; then
        echo "Note: Remote has existing commits. Will push after first commit."
    else
        echo "✓ Remote is empty - ready for initial push"
    fi
else
    echo "Note: No remote URL provided. Run with: ./init-repo.sh <remote-url>"
fi

# Stage all files
git add -A
echo "✓ All files staged"

# Create initial commit if there are files
if git diff --cached --quiet; then
    echo "Warning: No files to commit (empty project)"
else
    git commit -m "Initial commit - project scaffold"
    echo "✓ Initial commit created"
    
    # Push if remote exists
    if git remote get-url origin > /dev/null 2>&1; then
        git push -u origin main
        echo "✓ Pushed to remote"
    fi
fi

echo "=== Repository Ready ==="