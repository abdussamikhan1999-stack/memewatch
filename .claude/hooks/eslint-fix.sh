#!/bin/bash
f=$(jq -r '.tool_input.file_path // empty')
case "$f" in
  *.ts|*.tsx|*.js|*.jsx)
    cd "$(dirname "$0")/../.." && npx eslint --fix "$f" 2>/dev/null
    ;;
esac
exit 0
