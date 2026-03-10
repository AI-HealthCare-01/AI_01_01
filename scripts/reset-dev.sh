#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-emulator}"
AUTO_START="${2:-}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ "${MODE}" != "emulator" && "${MODE}" != "real" ]]; then
  echo "Usage: ./scripts/reset-dev.sh <emulator|real> [--start]"
  exit 1
fi

echo "[1/4] Stop stale dev processes"
for port in 3000 8000 9099 4000; do
  pids="$(lsof -ti tcp:"${port}" 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    echo "- kill port ${port}: ${pids}"
    kill -9 ${pids} 2>/dev/null || true
  fi
done
pkill -f "firebase emulators:start --only auth" 2>/dev/null || true
pkill -f "uvicorn app.main:app" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true

echo "[2/4] Clear Next cache"
rm -rf apps/web/.next

echo "[3/4] Doctor check (${MODE})"
./scripts/doctor-env.sh "${MODE}" || true

if [[ "${AUTO_START}" == "--start" ]]; then
  mkdir -p .logs
  ts="$(date +%Y%m%d-%H%M%S)"
  echo "[4/4] Start services in background (${MODE})"
  if [[ "${MODE}" == "emulator" ]]; then
    nohup make auth-emulator > ".logs/auth-${ts}.log" 2>&1 &
    nohup make api-dev-emulator > ".logs/api-${ts}.log" 2>&1 &
    nohup npm run dev:web:emulator > ".logs/web-${ts}.log" 2>&1 &
  else
    nohup make api-dev-real > ".logs/api-${ts}.log" 2>&1 &
    nohup npm run dev:web:real > ".logs/web-${ts}.log" 2>&1 &
  fi

  sleep 2
  echo
  echo "Started. Check logs:"
  if [[ "${MODE}" == "emulator" ]]; then
    echo "- .logs/auth-${ts}.log"
  fi
  echo "- .logs/api-${ts}.log"
  echo "- .logs/web-${ts}.log"
  echo
  echo "Port status:"
  lsof -nP -iTCP:3000 -sTCP:LISTEN || true
  lsof -nP -iTCP:8000 -sTCP:LISTEN || true
  if [[ "${MODE}" == "emulator" ]]; then
    lsof -nP -iTCP:9099 -sTCP:LISTEN || true
    lsof -nP -iTCP:4000 -sTCP:LISTEN || true
  fi
else
  echo "[4/4] Manual start commands"
  if [[ "${MODE}" == "emulator" ]]; then
    echo "make auth-emulator"
    echo "make api-dev-emulator"
    echo "npm run dev:web:emulator"
  else
    echo "make api-dev-real"
    echo "npm run dev:web:real"
  fi
fi
