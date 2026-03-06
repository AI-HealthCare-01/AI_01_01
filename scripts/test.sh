#!/usr/bin/env bash
set -euo pipefail

npm run test:web
npm run test:packages

run_pytest() {
  if [ -x "apps/api/.venv/bin/pytest" ]; then
    apps/api/.venv/bin/pytest "$@"
    return
  fi

  if command -v pytest >/dev/null 2>&1; then
    pytest "$@"
    return
  fi

  if command -v python >/dev/null 2>&1; then
    python -m pytest "$@"
    return
  fi

  python3 -m pytest "$@"
}

run_pytest apps/api/tests
