#!/usr/bin/env bash
# PostToolUse (Write|Edit): lint the file the agent just edited.
# Exit 2 + stderr is the only combination Claude sees.
# prettier/prettier is off on purpose: lint-staged runs `eslint --fix` at commit and repairs formatting
# (Tailwind class order etc.), so the agent is only told about errors it has to fix itself.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
export NO_COLOR=1 FORCE_COLOR=0

FILE=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -n "$FILE" ] || exit 0

# Only files inside the project; the payload path is absolute.
REL=${FILE#"$PWD"/}
[ "$REL" != "$FILE" ] || exit 0

# Only files the lint config covers (eslint-plugin-astro => .astro). src/types.ts is generated and ignored.
case "$REL" in
  .claude/*|src/types.ts) exit 0 ;;
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.astro) ;;
  *) exit 0 ;;
esac
[ -f "$REL" ] || exit 0

if ! OUTPUT=$(npx eslint --quiet --rule "prettier/prettier: off" "$REL" 2>&1); then
  echo "ESLint reported errors in $REL:" >&2
  printf '%s\n' "$OUTPUT" | head -n 60 >&2
  exit 2
fi
exit 0
