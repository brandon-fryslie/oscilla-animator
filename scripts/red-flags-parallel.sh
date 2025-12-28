#!/usr/bin/env bash
set -euo pipefail

# For every RedFlags audit file, create a worktree and run a command in parallel
# Usage: ./scripts/red-flags-parallel.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PATTERN="design-docs/implementation/compiler/Compiler-Audit-RedFlags-*.md"

cd "$REPO_ROOT"

for filepath in $PATTERN; do
    [[ -f "$filepath" ]] || continue

    filename="$(basename "$filepath")"
    # Extract topic: Compiler-Audit-RedFlags-{Topic}.md -> {Topic}
    topic="${filename#Compiler-Audit-RedFlags-}"
    topic="${topic%.md}"

    echo "Processing topic: $topic"

    # Create/switch to worktree for this topic
    git wt "$topic"

    # Run command from worktree root
    worktree_path="$REPO_ROOT/.worktrees/$topic"
    (
        cd "$worktree_path"
        echo "found file ${filename}"
    ) &
done

# Wait for all background jobs
wait
echo "All tasks completed."
