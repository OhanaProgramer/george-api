#!/usr/bin/env bash
set -euo pipefail
set +m

# ---------------------------------------------
# Smoke test for george-api (local)
# - Boots server on an ephemeral port
# - Verifies key endpoints respond as expected
# - Uses Authorization: Bearer <token>
# ---------------------------------------------

SMOKE_PORT="${SMOKE_PORT:-3100}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${SMOKE_PORT}}"

# Tokens can be provided via env, otherwise use dev defaults.
SMOKE_READ_TOKEN="${SMOKE_READ_TOKEN:-cat_site}"
SMOKE_ADMIN_TOKEN="${SMOKE_ADMIN_TOKEN:-cat_admin}"

LOG_FILE="${LOG_FILE:-/tmp/george-smoke.log}"

# Ensure we run from repo root even if invoked elsewhere.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Helpers
fail() {
  echo "ERROR: $*" >&2
  exit 1
}

http_code() {
  # Usage: http_code <method> <url> [<auth_token_or_empty>]
  local method="$1"; shift
  local url="$1"; shift
  local token="${1:-}"; shift || true

  if [[ -n "$token" ]]; then
    curl -sS -o /tmp/george-smoke.body -w "%{http_code}" -X "$method" \
      -H "Authorization: Bearer ${token}" \
      "$url"
  else
    curl -sS -o /tmp/george-smoke.body -w "%{http_code}" -X "$method" \
      "$url"
  fi
}

expect_code() {
  # Usage: expect_code <expected> <method> <url> [<token_or_empty>]
  local expected="$1"; shift
  local method="$1"; shift
  local url="$1"; shift
  local token="${1:-}"; shift || true

  local code
  code="$(http_code "$method" "$url" "$token")"

  if [[ "$code" != "$expected" ]]; then
    echo "FAIL ${url} -> ${code} (expected ${expected})"
    echo "--- response body (first 200 lines) ---"
    sed -n '1,200p' /tmp/george-smoke.body || true
    echo "--- server log tail ---"
    tail -n 80 "$LOG_FILE" || true
    exit 1
  fi

  echo "PASS ${url} -> ${code}"
}

wait_for_health() {
  local url="$1"
  local token="$2"

  # Try for ~5 seconds total
  for _ in {1..25}; do
    if curl -sS -o /dev/null -H "Authorization: Bearer ${token}" "$url" 2>/dev/null; then
      return 0
    fi
    sleep 0.2
  done

  return 1
}

# Start server
: > "$LOG_FILE"

echo "Starting server for smoke on port ${SMOKE_PORT}…"
(
  export PORT="$SMOKE_PORT"
  export SITE_TOKENS_READONLY="$SMOKE_READ_TOKEN"
  export SITE_TOKENS_ADMIN="$SMOKE_ADMIN_TOKEN"
  node server.js
) >> "$LOG_FILE" 2>&1 &
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    # Wait so bash doesn't print a termination message for the background job.
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Wait for server readiness
if ! wait_for_health "${BASE_URL}/health" "$SMOKE_READ_TOKEN"; then
  echo "Server did not become ready. Log tail:"
  tail -n 120 "$LOG_FILE" || true
  exit 1
fi

# Tests
# 1) /health is public
expect_code 200 GET "${BASE_URL}/health" ""

# 2) Protected pages should reject missing auth
expect_code 401 GET "${BASE_URL}/pushups/log" ""
expect_code 401 GET "${BASE_URL}/pushups/analytics" ""
expect_code 401 GET "${BASE_URL}/pushups/settings" ""

# 3) Readonly token should allow reads
expect_code 200 GET "${BASE_URL}/pushups/log" "$SMOKE_READ_TOKEN"
expect_code 200 GET "${BASE_URL}/pushups/analytics" "$SMOKE_READ_TOKEN"
expect_code 200 GET "${BASE_URL}/pushups/stats.json" "$SMOKE_READ_TOKEN"
expect_code 200 GET "${BASE_URL}/pushups/analytics.json" "$SMOKE_READ_TOKEN"
expect_code 401 GET "${BASE_URL}/pushups/settings" "$SMOKE_READ_TOKEN"

# 4) Admin token should also allow reads (admin is a superset)
expect_code 200 GET "${BASE_URL}/pushups/stats.json" "$SMOKE_ADMIN_TOKEN"
expect_code 200 GET "${BASE_URL}/pushups/settings" "$SMOKE_ADMIN_TOKEN"

echo "Smoke test passed"
