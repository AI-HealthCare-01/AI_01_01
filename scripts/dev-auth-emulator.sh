#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${FIREBASE_PROJECT_ID:-demo-mindsight}"

if [ ! -x "./node_modules/.bin/firebase" ]; then
  echo "firebase-tools 로컬 dev dependency가 설치되어 있지 않습니다."
  echo "먼저 아래를 실행하세요:"
  echo "  npm install"
  exit 1
fi

npx --no-install firebase emulators:start --only auth --project "${PROJECT_ID}"
