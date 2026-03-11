#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load root env files so `npm run dev` works consistently without manual export.
for env_file in "${ROOT_DIR}/.env" "${ROOT_DIR}/.env.local"; do
  if [[ -f "${env_file}" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "${env_file}"
    set +a
  fi
done

export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-http://localhost:8000}"
export MINDSIGHT_ROOT_DEV="1"
USE_FIREBASE_AUTH_EMULATOR="${USE_FIREBASE_AUTH_EMULATOR:-false}"
use_emulator="$(printf "%s" "${USE_FIREBASE_AUTH_EMULATOR}" | tr "[:upper:]" "[:lower:]")"
if [[ "${use_emulator}" =~ ^(1|true|yes|y|on)$ ]]; then
  export NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR="true"
  export NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST="${NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST:-127.0.0.1:9099}"
  export NEXT_PUBLIC_FIREBASE_PROJECT_ID="${NEXT_PUBLIC_FIREBASE_PROJECT_ID:-demo-mindsight}"
  export NEXT_PUBLIC_FIREBASE_API_KEY="${NEXT_PUBLIC_FIREBASE_API_KEY:-demo-api-key}"
  export NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:-demo-mindsight.firebaseapp.com}"
  export NEXT_PUBLIC_FIREBASE_APP_ID="${NEXT_PUBLIC_FIREBASE_APP_ID:-1:000000000000:web:0000000000000000000000}"
  export NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:-000000000000}"
else
  export NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR="false"
  unset NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST
  : "${NEXT_PUBLIC_FIREBASE_PROJECT_ID:?NEXT_PUBLIC_FIREBASE_PROJECT_ID is required when USE_FIREBASE_AUTH_EMULATOR=false}"
  : "${NEXT_PUBLIC_FIREBASE_API_KEY:?NEXT_PUBLIC_FIREBASE_API_KEY is required when USE_FIREBASE_AUTH_EMULATOR=false}"
  : "${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:?NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is required when USE_FIREBASE_AUTH_EMULATOR=false}"
  : "${NEXT_PUBLIC_FIREBASE_APP_ID:?NEXT_PUBLIC_FIREBASE_APP_ID is required when USE_FIREBASE_AUTH_EMULATOR=false}"
  : "${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:?NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID is required when USE_FIREBASE_AUTH_EMULATOR=false}"
fi
export NEXT_PUBLIC_AUTH_CONTINUE_BASE_URL="${NEXT_PUBLIC_AUTH_CONTINUE_BASE_URL:-http://localhost:${WEB_PORT:-3000}}"

npm run dev --workspace @mindsight/web -- --hostname "${WEB_HOST:-0.0.0.0}" --port "${WEB_PORT:-3000}"
