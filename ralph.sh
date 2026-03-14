#!/bin/bash
# Ralph Runner for OpenLark
# Usage: ./ralph.sh [--max-iterations N]
#
# Runs Claude Code in a loop, working through prd.json stories sequentially.
# Each iteration picks the next story with passes:false and implements it.

set -euo pipefail
cd "$(dirname "$0")"

MAX_ITERATIONS="${1:-0}"
ITERATION=0

PROMPT='You are Ralph, an autonomous coding agent building OpenLark — an open source Lark/Feishu clone.

## Your Task

1. Read `prd.json` and find the FIRST user story where `"passes": false`
2. Read `progress.txt` to see what has been done in previous iterations
3. Implement that story completely:
   - Read existing code to understand the current state
   - Write/modify files to satisfy all acceptance criteria
   - Run typechecks (`npx tsc --noEmit`) and fix any errors
   - For UI stories, verify in browser using dev-browser skill
4. When the story passes all acceptance criteria:
   - Update `prd.json`: set `"passes": true` and add implementation notes to `"notes"`
   - Append a line to `progress.txt` with the timestamp, story ID, title, and PASS
   - Git commit all changes with message: "feat(US-XXX): Story title"
5. If you get stuck or a story cannot be completed:
   - Append to `progress.txt` with FAIL and a brief reason
   - Do NOT set passes to true
   - Move on to document what blocked you

## Important Rules

- Work on exactly ONE story per iteration
- Do not skip ahead — stories are ordered by dependency
- Always check existing code before writing new code
- Follow the established patterns in the codebase
- Every commit must typecheck cleanly
- If this is the first iteration (no src/ directory), start with US-001: scaffold the monorepo

## Project Context

- Tech stack: Next.js 15, Fastify 5, PostgreSQL 16, Redis 7, Turborepo monorepo
- See prd.json for full project description and all user stories
- Branch: ralph/openlark-v1'

echo "========================================="
echo "  Ralph Runner — OpenLark"
echo "  Max iterations: $(if [[ $MAX_ITERATIONS -gt 0 ]]; then echo $MAX_ITERATIONS; else echo unlimited; fi)"
echo "========================================="

while true; do
  ITERATION=$((ITERATION + 1))

  if [[ $MAX_ITERATIONS -gt 0 ]] && [[ $ITERATION -gt $MAX_ITERATIONS ]]; then
    echo ""
    echo "🛑 Max iterations ($MAX_ITERATIONS) reached. Stopping."
    break
  fi

  echo ""
  echo "🔄 Iteration $ITERATION — $(date '+%Y-%m-%d %H:%M:%S')"
  echo "-----------------------------------------"

  # Count remaining stories
  REMAINING=$(python3 -c "import json; d=json.load(open('prd.json')); print(sum(1 for s in d['userStories'] if not s['passes']))")
  echo "Stories remaining: $REMAINING"

  if [[ "$REMAINING" == "0" ]]; then
    echo ""
    echo "✅ All stories complete! OpenLark build finished."
    break
  fi

  # Run Claude Code with the prompt (skip permissions for autonomous operation)
  claude --print --dangerously-skip-permissions "$PROMPT" 2>&1 | tee -a "ralph-iteration-${ITERATION}.log"

  echo ""
  echo "Iteration $ITERATION complete."
  sleep 2
done

echo ""
echo "========================================="
echo "  Ralph Runner finished"
echo "  Total iterations: $ITERATION"
echo "========================================="
