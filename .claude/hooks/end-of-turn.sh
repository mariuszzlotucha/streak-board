#!/usr/bin/env bash
# Stop: sweep everything this turn changed before the agent finishes, one retry.
# Covers edits the per-edit hooks never see (sed -i, cat > f <<EOF). Order: lint, tests, typecheck.
# Gate commands match CI: ESLint, Vitest (`npm test`), `astro check` (it syncs the gitignored .astro/ itself).
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
export NO_COLOR=1 FORCE_COLOR=0

INPUT=$(cat)

# Already sent back once by this hook: let it finish. The pre-commit and CI gates catch the rest.
# (loop_count covers Cursor, which imports hooks from .claude/settings.json.)
ACTIVE=$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)
LOOPS=$(printf '%s' "$INPUT" | jq -r '.loop_count // 0' 2>/dev/null)
if [ "$ACTIVE" = "true" ] || [ "${LOOPS:-0}" != "0" ]; then
  exit 0
fi

# Changed and new files, relative to the project root. Nothing changed (a Q&A turn): nothing to check.
CHANGED=$({ git diff --name-only --relative HEAD; git ls-files -o --exclude-standard; } 2>/dev/null | sort -u)
[ -n "$CHANGED" ] || exit 0

# CODE=1 when a file that affects lint, tests or types changed (deleted files count: they can break imports).
# FILES = those the linter covers that still exist. Docs, SQL, JSON and .claude/ never trigger the sweep.
CODE=0
FILES=()
while IFS= read -r f; do
  case "$f" in
    .claude/*|src/types.ts) ;;
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.astro) CODE=1; [ -f "$f" ] && FILES+=("$f") ;;
    package.json|tsconfig.json|vitest.config.ts|astro.config.mjs) CODE=1 ;;
  esac
done <<EOF
$CHANGED
EOF
[ "$CODE" = "1" ] || exit 0

REPORT=""
NOTE=""

if [ "${#FILES[@]}" -gt 0 ]; then
  # prettier/prettier is off on purpose: lint-staged repairs formatting at commit.
  OUT=$(npx eslint --quiet --rule "prettier/prettier: off" "${FILES[@]}" 2>&1) || REPORT="$REPORT
ESLint errors in changed files:
$(printf '%s\n' "$OUT" | head -n 60)
"
fi

# The whole suite takes ~6 s, so it also catches a red test in a module this turn only imported.
# tests/setup/global-setup.ts needs the local Supabase stack: without it the run is skipped, not failed.
HEALTH=$(curl -s -m 2 -o /dev/null -w '%{http_code}' -H 'apikey: hook' \
  "${TEST_SUPABASE_URL:-http://127.0.0.1:54321}/auth/v1/health" 2>/dev/null)
if [ "${HEALTH:-000}" != "000" ]; then
  OUT=$(npx vitest run 2>&1) || REPORT="$REPORT
Vitest fails:
$(printf '%s\n' "$OUT" | head -n 80)
"
else
  NOTE="Hook end-of-turn: Vitest skipped, local Supabase is not running (run 'npx supabase start' to enable the test gate)."
fi

# astro check ignores NO_COLOR: strip ANSI escapes and its startup log lines so the agent reads plain diagnostics.
ESC=$(printf '\033')
OUT=$(npx astro check 2>&1) || REPORT="$REPORT
Typecheck (astro check) fails:
$(printf '%s\n' "$OUT" | sed "s/${ESC}\[[0-9;]*m//g" | grep --color=never -vE '^[0-9]{2}:[0-9]{2}:[0-9]{2} \[' | head -n 80)
"

if [ -n "$REPORT" ]; then
  echo "Fix these before you finish:$REPORT" >&2
  exit 2
fi
if [ -n "$NOTE" ]; then
  jq -n --arg m "$NOTE" '{systemMessage: $m}'
fi
exit 0
