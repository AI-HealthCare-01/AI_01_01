#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/infra/docker/docker-compose.yml"
ENV_FILE="${ROOT_DIR}/.env"

compose_args=(-f "${COMPOSE_FILE}")
if [ -f "${ENV_FILE}" ]; then
  compose_args+=(--env-file "${ENV_FILE}")
fi

docker compose "${compose_args[@]}" down --remove-orphans
