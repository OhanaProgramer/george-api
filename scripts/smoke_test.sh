#!/usr/bin/env bash
set -euo pipefail

PORT="${SMOKE_PORT:-3100}"
READ_TOKEN="${SMOKE_READ_TOKEN:-cat_site}"
BASE_URL="http://127.0.0.1:${PORT}"

SITE_TOKENS_READONLY="$READ_TOKEN" SITE_TOKENS_ADMIN="${SMOKE_ADMIN_TOKEN:-cat_admin}" PORT="$PORT" node server.js >/tmp/george-smoke.log 2>&1 &
PID=$!
cleanup() {
  kill "$PID" >/dev/null 2>&1 || true
  wait "$PID" 2>/dev/null || true
}
trap cleanup EXIT

sleep 1

check_200() {
  local url="$1"
  local code
  code=$(curl -s -o /tmp/george-smoke-body.txt -w "%{http_code}" -H "Authorization: Bearer $READ_TOKEN" "$url")
  if [[ "$code" != "200" ]]; then
    echo "FAIL $url -> $code"
    cat /tmp/george-smoke-body.txt
    exit 1
  fi
  echo "PASS $url -> 200"
}

check_200 "$BASE_URL/pushups/log"
check_200 "$BASE_URL/pushups/analytics"
check_200 "$BASE_URL/pushups/stats.json"
check_200 "$BASE_URL/pushups/analytics.json"

echo "Smoke test passed"
