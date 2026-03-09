#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="${ROOT_DIR}/apps/api"

if [ -f "${ROOT_DIR}/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/.env"
  set +a
fi

USE_FIREBASE_AUTH_EMULATOR="${USE_FIREBASE_AUTH_EMULATOR:-false}"
use_emulator="$(printf "%s" "${USE_FIREBASE_AUTH_EMULATOR}" | tr "[:upper:]" "[:lower:]")"
if [[ "${use_emulator}" =~ ^(1|true|yes|y|on)$ ]]; then
  export FIREBASE_AUTH_EMULATOR_HOST="${FIREBASE_AUTH_EMULATOR_HOST:-127.0.0.1:9099}"
  export AUTH_ALLOW_EMULATOR_UID_FALLBACK="${AUTH_ALLOW_EMULATOR_UID_FALLBACK:-true}"
  export FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-demo-mindsight}"
  export FIREBASE_ADMIN_PROJECT_ID="${FIREBASE_ADMIN_PROJECT_ID:-${FIREBASE_PROJECT_ID}}"
else
  unset FIREBASE_AUTH_EMULATOR_HOST
  export AUTH_ALLOW_EMULATOR_UID_FALLBACK="${AUTH_ALLOW_EMULATOR_UID_FALLBACK:-false}"
  : "${FIREBASE_PROJECT_ID:?FIREBASE_PROJECT_ID is required when USE_FIREBASE_AUTH_EMULATOR=false}"
  export FIREBASE_ADMIN_PROJECT_ID="${FIREBASE_ADMIN_PROJECT_ID:-${FIREBASE_PROJECT_ID}}"
fi
export AUTH_DATABASE_PATH="${AUTH_DATABASE_PATH:-${ROOT_DIR}/apps/api/.data/auth_account.db}"
export MODEL_BUNDLE_DIR="${MODEL_BUNDLE_DIR:-${ROOT_DIR}/model}"
export CORS_ALLOW_ORIGINS="${CORS_ALLOW_ORIGINS:-http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001}"

if [ -f "${API_DIR}/.venv/bin/activate" ]; then
  # shellcheck disable=SC1091
  source "${API_DIR}/.venv/bin/activate"
fi

cd "${API_DIR}"
uvicorn app.main:app \
  --reload \
  --reload-dir app \
  --host "${API_HOST:-0.0.0.0}" \
  --port "${API_PORT:-8000}"
