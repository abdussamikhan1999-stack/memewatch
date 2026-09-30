#!/bin/bash
cd "$(dirname "$0")/../.."
out=$(npm test 2>&1)
code=$?
if [ $code -ne 0 ]; then
  reason=$(printf '%s' "$out" | tail -c 2000 | jq -Rs .)
  printf '{"decision":"block","reason":%s}' "$reason"
fi
exit 0
