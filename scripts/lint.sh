#!/usr/bin/env bash
set -euo pipefail

npm run lint:web
npm run lint:packages

run_ruff() {
  if [ -x "apps/api/.venv/bin/ruff" ]; then
    apps/api/.venv/bin/ruff check "$@"
    return
  fi

  if command -v ruff >/dev/null 2>&1; then
    ruff check "$@"
    return
  fi

  if command -v python >/dev/null 2>&1 && python -c "import ruff" >/dev/null 2>&1; then
    python -m ruff check "$@"
    return
  fi

  python3 -m ruff check "$@"
}

run_ruff apps/api/app apps/api/tests
