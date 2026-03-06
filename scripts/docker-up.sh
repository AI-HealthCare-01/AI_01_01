#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/infra/docker/docker-compose.yml"
ENV_FILE="${ROOT_DIR}/.env"

is_truthy() {
  local value="${1:-}"
  value="$(printf "%s" "${value}" | tr "[:upper:]" "[:lower:]")"
  case "${value}" in
    1|true|yes|y|on) return 0 ;;
    *) return 1 ;;
  esac
}

read_env_fallback() {
  local key="$1"
  if [ ! -f "${ENV_FILE}" ]; then
    echo ""
    return
  fi

  local line
  line="$(grep -E "^${key}=" "${ENV_FILE}" | tail -n 1 || true)"
  if [ -z "${line}" ]; then
    echo ""
    return
  fi

  local value="${line#*=}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf "%s" "${value}"
}

resolve_var() {
  local key="$1"
  local current="${!key:-}"
  if [ -n "${current}" ]; then
    printf "%s" "${current}"
    return
  fi
  read_env_fallback "${key}"
}

port_in_use() {
  local port="$1"
  lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
}

pick_port() {
  local first="$1"
  local second="$2"
  if ! port_in_use "${first}"; then
    echo "${first}"
    return
  fi
  if ! port_in_use "${second}"; then
    echo "${second}"
    return
  fi
  echo ""
}

WEB_PORT="${WEB_PORT:-$(pick_port 3000 3001)}"
API_PORT="${API_PORT:-$(pick_port 8000 8010)}"
DB_PORT="${DB_PORT:-$(pick_port 5432 5433)}"
USE_FIREBASE_AUTH_EMULATOR="${USE_FIREBASE_AUTH_EMULATOR:-false}"

AUTH_EMULATOR_PORT=""
AUTH_EMULATOR_UI_PORT=""
if is_truthy "${USE_FIREBASE_AUTH_EMULATOR}"; then
  AUTH_EMULATOR_PORT="${AUTH_EMULATOR_PORT:-$(pick_port 9099 9100)}"
  AUTH_EMULATOR_UI_PORT="${AUTH_EMULATOR_UI_PORT:-$(pick_port 4000 4001)}"
fi

if [ -z "${WEB_PORT}" ] || [ -z "${API_PORT}" ] || [ -z "${DB_PORT}" ]; then
  echo "필수 포트가 이미 사용 중입니다."
  echo "사용 중인 포트를 정리하거나 환경변수로 포트를 지정하세요."
  echo "예: WEB_PORT=3001 API_PORT=8010 DB_PORT=5433 make docker-up"
  exit 1
fi

if is_truthy "${USE_FIREBASE_AUTH_EMULATOR}" && { [ -z "${AUTH_EMULATOR_PORT}" ] || [ -z "${AUTH_EMULATOR_UI_PORT}" ]; }; then
  echo "필수 포트가 이미 사용 중입니다."
  echo "사용 중인 포트를 정리하거나 환경변수로 포트를 지정하세요."
  echo "예: WEB_PORT=3001 API_PORT=8010 DB_PORT=5433 AUTH_EMULATOR_PORT=9100 AUTH_EMULATOR_UI_PORT=4001 make docker-up"
  exit 1
fi

export WEB_PORT
export API_PORT
export DB_PORT
export WEB_API_BASE_URL="http://localhost:${API_PORT}"
export WEB_BASE_URL="http://localhost:${WEB_PORT}"
export USE_FIREBASE_AUTH_EMULATOR

services=(postgres api web)
if is_truthy "${USE_FIREBASE_AUTH_EMULATOR}"; then
  export AUTH_EMULATOR_PORT
  export AUTH_EMULATOR_UI_PORT
  export WEB_AUTH_EMULATOR_HOST="${WEB_AUTH_EMULATOR_HOST:-localhost:${AUTH_EMULATOR_PORT}}"
  export FIREBASE_AUTH_EMULATOR_HOST="${FIREBASE_AUTH_EMULATOR_HOST:-auth-emulator:9099}"
  export AUTH_ALLOW_EMULATOR_UID_FALLBACK="${AUTH_ALLOW_EMULATOR_UID_FALLBACK:-true}"
  export NEXT_PUBLIC_FIREBASE_PROJECT_ID="${NEXT_PUBLIC_FIREBASE_PROJECT_ID:-demo-mindsight}"
  export NEXT_PUBLIC_FIREBASE_API_KEY="${NEXT_PUBLIC_FIREBASE_API_KEY:-demo-api-key}"
  export NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:-demo-mindsight.firebaseapp.com}"
  export NEXT_PUBLIC_FIREBASE_APP_ID="${NEXT_PUBLIC_FIREBASE_APP_ID:-1:000000000000:web:0000000000000000000000}"
  export NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:-000000000000}"
  export FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-${NEXT_PUBLIC_FIREBASE_PROJECT_ID}}"
  export FIREBASE_ADMIN_PROJECT_ID="${FIREBASE_ADMIN_PROJECT_ID:-${FIREBASE_PROJECT_ID}}"
  services=(postgres auth-emulator api web)
else
  export WEB_AUTH_EMULATOR_HOST=""
  export FIREBASE_AUTH_EMULATOR_HOST=""
  export AUTH_ALLOW_EMULATOR_UID_FALLBACK="${AUTH_ALLOW_EMULATOR_UID_FALLBACK:-false}"

  if [ -z "${FIREBASE_PROJECT_ID:-}" ]; then
    export FIREBASE_PROJECT_ID="$(resolve_var NEXT_PUBLIC_FIREBASE_PROJECT_ID)"
  fi
  export FIREBASE_ADMIN_PROJECT_ID="${FIREBASE_ADMIN_PROJECT_ID:-${FIREBASE_PROJECT_ID:-}}"

  missing=()
  for key in \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
    FIREBASE_PROJECT_ID; do
    value="$(resolve_var "${key}")"
    if [ -z "${value}" ]; then
      missing+=("${key}")
    fi
  done

  if [ "${#missing[@]}" -gt 0 ]; then
    echo "실 Firebase 모드 실행에 필요한 환경변수가 누락되었습니다."
    echo "누락 항목: ${missing[*]}"
    echo ".env를 채우거나 USE_FIREBASE_AUTH_EMULATOR=true로 실행하세요."
    exit 1
  fi
fi

compose_args=(-f "${COMPOSE_FILE}")
if [ -f "${ENV_FILE}" ]; then
  compose_args+=(--env-file "${ENV_FILE}")
fi

docker compose "${compose_args[@]}" up -d --build "${services[@]}"

echo "web: http://localhost:${WEB_PORT}"
echo "api: http://localhost:${API_PORT}/healthz"
echo "db: postgres://postgres:postgres@localhost:${DB_PORT}/mindsight_local"
if is_truthy "${USE_FIREBASE_AUTH_EMULATOR}"; then
  echo "auth emulator ui: http://localhost:${AUTH_EMULATOR_UI_PORT}/auth"
  echo "note: 에뮬레이터 모드에서는 실제 이메일이 발송되지 않습니다."
else
  echo "note: 실 Firebase 모드입니다. 이메일 인증/재설정 메일이 실제로 발송됩니다."
fi
