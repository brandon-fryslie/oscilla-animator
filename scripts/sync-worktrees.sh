#!/usr/bin/env bash
set -euo pipefail

# Sync all worktrees in .worktrees/ to match the current commit
# Usage: ./scripts/sync-worktrees.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKTREES_DIR="$REPO_ROOT/.worktrees"

# Get the commit hash from the main repo
TARGET_COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD)"
echo "Target commit: $TARGET_COMMIT"

if [[ ! -d "$WORKTREES_DIR" ]]; then
    echo "No .worktrees directory found"
    exit 0
fi

for worktree in "$WORKTREES_DIR"/*/; do
    # Skip if not a directory or is .agent_logs
    [[ -d "$worktree" ]] || continue
    [[ "$(basename "$worktree")" == ".agent_logs" ]] && continue

    name="$(basename "$worktree")"
    echo "Resetting $name..."
    git -C "$worktree" reset --hard "$TARGET_COMMIT" 2>&1 | sed 's/^/  /'
done

echo "Done."
