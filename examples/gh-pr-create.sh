#!/usr/bin/env bash
# Copy-pasteable: draft a PR title + body with diff-vibe, then open via gh.
# 可复制：用 diff-vibe 生成 title/body，再交给 gh 开 PR。
#
# Pin: @webywz/diff-vibe@^0.1.6  ·  Companion: @webywz/vibe-commit
# Requires: Node.js 18.18+, git, gh  ·  需要：Node 18.18+、git、gh
#
# Typical pair flow · 成对流程：
#   git add -p && npx --yes @webywz/vibe-commit --commit
#   ./examples/gh-pr-create.sh          # or: BASE=develop ./examples/gh-pr-create.sh
#
# Preview without posting · 只预览不开 PR：
#   DRY_RUN=1 ./examples/gh-pr-create.sh

set -euo pipefail

BASE="${BASE:-main}"
PKG="@webywz/diff-vibe@^0.1.6"

TITLE="$(npx --yes "$PKG" --base "$BASE" --title-only)"
BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT
npx --yes "$PKG" --base "$BASE" --body-only >"$BODY_FILE"

if [[ "${DRY_RUN:-}" == "1" ]]; then
  # Print the gh command only · 只打印命令
  printf 'gh pr create --title %q --body-file %q\n' "$TITLE" "$BODY_FILE"
  echo "----- title -----"
  printf '%s\n' "$TITLE"
  echo "----- body -----"
  cat "$BODY_FILE"
  exit 0
fi

# Process substitution variant (bash) · bash 进程替换写法：
#   gh pr create \
#     --title "$(npx --yes @webywz/diff-vibe@^0.1.6 --base main --title-only)" \
#     --body-file <(npx --yes @webywz/diff-vibe@^0.1.6 --base main --body-only)

gh pr create --title "$TITLE" --body-file "$BODY_FILE"
