#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8001}"
EMAIL="${EMAIL:-crisis_test_$(date +%s)@example.com}"
PASSWORD="${PASSWORD:-StrongPass123}"
NICKNAME="${NICKNAME:-crisis_tester}"

has_jq() {
  command -v jq >/dev/null 2>&1
}

post_json() {
  local url="$1"
  local data="$2"
  local auth_header="${3:-}"

  if [[ -n "$auth_header" ]]; then
    curl -sS -X POST "${BASE_URL}${url}" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${auth_header}" \
      -d "$data"
  else
    curl -sS -X POST "${BASE_URL}${url}" \
      -H "Content-Type: application/json" \
      -d "$data"
  fi
}

echo "[1/5] Signup: ${EMAIL}"
signup_payload="{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"nickname\":\"${NICKNAME}\"}"
signup_resp="$(post_json "/auth/signup" "$signup_payload" || true)"
echo "signup done"

echo "[2/5] Login"
login_payload="{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}"
login_resp="$(post_json "/auth/login" "$login_payload")"

if has_jq; then
  TOKEN="$(echo "$login_resp" | jq -r '.access_token')"
else
  TOKEN="$(echo "$login_resp" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')"
fi

if [[ -z "${TOKEN}" || "${TOKEN}" == "null" ]]; then
  echo "ERROR: login failed or token parse failed"
  echo "raw login response: ${login_resp}"
  exit 1
fi

echo "[3/5] CRISIS_A trigger"
resp_a="$(post_json "/chat/cbt" "{\"message\":\"오늘 죽을 거야. 준비 중이야.\",\"conversation_history\":[]}" "$TOKEN")"

echo "[4/5] CRISIS_B trigger"
resp_b="$(post_json "/chat/cbt" "{\"message\":\"알겠어. 전화 연결 중이야.\",\"conversation_history\":[]}" "$TOKEN")"

echo "[5/5] CRISIS_C trigger"
resp_c="$(post_json "/chat/cbt" "{\"message\":\"응급실 도착했고 옆에 간호사 있어. 지금은 안전해.\",\"conversation_history\":[]}" "$TOKEN")"

print_summary() {
  local label="$1"
  local payload="$2"
  echo "----- ${label} -----"
  if has_jq; then
    echo "$payload" | jq '{crisis_mode, crisis_stage, crisis_actions}'
  else
    echo "jq not found. raw response:"
    echo "$payload"
  fi
}

print_summary "TURN A" "$resp_a"
print_summary "TURN B" "$resp_b"
print_summary "TURN C" "$resp_c"

cat <<'EOF'

[log check]
1) 실시간 위기 로그:
   docker compose logs -f api | grep --line-buffered -i "crisis"

2) 최근 로그 200줄:
   docker compose logs --tail 200 api | grep -i "\[crisis\]"

3) access log 포함 확인:
   docker compose logs --tail 200 api | grep -E "POST /auth/login|POST /chat/cbt"
EOF
