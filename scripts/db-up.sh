#!/usr/bin/env bash
set -euo pipefail

if docker compose version >/dev/null 2>&1; then
  docker compose -f infra/docker/docker-compose.yml up -d postgres
elif command -v docker-compose >/dev/null 2>&1; then
  docker-compose -f infra/docker/docker-compose.yml up -d postgres
else
  echo "docker compose 또는 docker-compose 명령을 찾을 수 없습니다."
  exit 1
fi
