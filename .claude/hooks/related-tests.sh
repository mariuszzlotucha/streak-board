#!/usr/bin/env bash
# PostToolUse (Write|Edit): run the Vitest tests that depend on the edited file.
# tests/setup/global-setup.ts needs the local Supabase stack; without it every run would fail for a reason
# the edit did not cause, so the hook stays silent then (end-of-turn.sh warns the user once per turn).
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
export NO_COLOR=1 FORCE_COLOR=0

FILE=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -n "$FILE" ] || exit 0

REL=${FILE#"$PWD"/}
[ "$REL" != "$FILE" ] || exit 0

case "$REL" in
  .claude/*) exit 0 ;;
  *.ts|*.tsx|*.js|*.jsx|*.mjs) ;;
  *) exit 0 ;;
esac
[ -f "$REL" ] || exit 0

CODE=$(curl -s -m 2 -o /dev/null -w '%{http_code}' -H 'apikey: hook' \
  "${TEST_SUPABASE_URL:-http://127.0.0.1:54321}/auth/v1/health" 2>/dev/null)
[ "${CODE:-000}" != "000" ] || exit 0

if ! OUTPUT=$(npx vitest related "$REL" --run 2>&1); then
  echo "Tests related to $REL fail:" >&2
  printf '%s\n' "$OUTPUT" | head -n 80 >&2
  exit 2
fi
exit 0
