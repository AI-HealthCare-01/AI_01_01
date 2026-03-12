#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"
if [[ "${MODE}" != "emulator" && "${MODE}" != "real" ]]; then
  echo "Usage: ./scripts/doctor-env.sh <emulator|real>"
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CWD="$(pwd)"
EXPECTED_ROOT="/Users/MO/PyCharmProjects/MindMe"

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

report() {
  local level="$1"
  local message="$2"
  case "${level}" in
    PASS) PASS_COUNT=$((PASS_COUNT + 1)) ;;
    WARN) WARN_COUNT=$((WARN_COUNT + 1)) ;;
    FAIL) FAIL_COUNT=$((FAIL_COUNT + 1)) ;;
  esac
  printf "%-5s %s\n" "${level}" "${message}"
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf "%s" "${value}"
}

strip_quotes() {
  local value="$1"
  if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf "%s" "${value}"
}

get_var_from_file() {
  local file="$1"
  local key="$2"
  [[ -f "${file}" ]] || return 0
  awk -v k="${key}" '
    /^[[:space:]]*#/ { next }
    {
      line=$0
      sub(/^[[:space:]]*export[[:space:]]+/, "", line)
      if (line ~ "^[[:space:]]*" k "=") {
        sub("^[[:space:]]*" k "=", "", line)
        print line
      }
    }
  ' "${file}" | tail -n 1
}

get_var() {
  local key="$1"
  local v=""
  if [[ -f "${ROOT_DIR}/.env" ]]; then
    v="$(get_var_from_file "${ROOT_DIR}/.env" "${key}")"
  fi
  if [[ -f "${ROOT_DIR}/.env.local" ]]; then
    local v_local
    v_local="$(get_var_from_file "${ROOT_DIR}/.env.local" "${key}")"
    if [[ -n "${v_local}" || "$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "${ROOT_DIR}/.env.local" || true)" != "" ]]; then
      v="${v_local}"
    fi
  fi
  v="$(trim "${v}")"
  v="$(strip_quotes "${v}")"
  printf "%s" "${v}"
}

is_true() {
  local value
  value="$(printf "%s" "$1" | tr '[:upper:]' '[:lower:]')"
  [[ "${value}" == "1" || "${value}" == "true" || "${value}" == "yes" || "${value}" == "y" || "${value}" == "on" ]]
}

is_false() {
  local value
  value="$(printf "%s" "$1" | tr '[:upper:]' '[:lower:]')"
  [[ "${value}" == "0" || "${value}" == "false" || "${value}" == "no" || "${value}" == "n" || "${value}" == "off" ]]
}

json_script_exists() {
  local file="$1"
  local script_name="$2"
  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const name = process.argv[2];
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      const exists = !!(data.scripts && Object.prototype.hasOwnProperty.call(data.scripts, name));
      process.exit(exists ? 0 : 1);
    } catch {
      process.exit(2);
    }
  ' "${file}" "${script_name}" >/dev/null 2>&1
}

json_script_value() {
  local file="$1"
  local script_name="$2"
  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const name = process.argv[2];
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    process.stdout.write(String((data.scripts && data.scripts[name]) || ""));
  ' "${file}" "${script_name}" 2>/dev/null || true
}

echo "=== MindMe Doctor (${MODE}) ==="
echo "Root from script: ${ROOT_DIR}"
echo "Current dir      : ${CWD}"
echo

if [[ "${CWD}" == "${ROOT_DIR}" ]]; then
  report PASS "현재 실행 위치가 프로젝트 루트입니다."
else
  report FAIL "루트가 아닙니다. 먼저 실행: cd \"${ROOT_DIR}\""
fi

if [[ "${ROOT_DIR}" == "${EXPECTED_ROOT}" ]]; then
  report PASS "루트 경로가 기대값(${EXPECTED_ROOT})과 일치합니다."
else
  report WARN "루트 경로가 기대값과 다릅니다. (현재: ${ROOT_DIR}, 기대: ${EXPECTED_ROOT})"
fi

if [[ -f "${ROOT_DIR}/.env" ]]; then
  report PASS ".env 파일이 존재합니다."
else
  report FAIL ".env 파일이 없습니다. .env.example 기준으로 생성하세요."
fi

if [[ -f "${ROOT_DIR}/.env.local" ]]; then
  report PASS ".env.local 파일이 존재합니다. (.env보다 우선 적용)"
else
  report WARN ".env.local 파일이 없습니다. (필수 아님)"
fi

for f in "${ROOT_DIR}/scripts/dev-web.sh" "${ROOT_DIR}/scripts/dev-api.sh"; do
  if [[ -f "${f}" ]]; then
    report PASS "$(basename "${f}") 파일이 존재합니다."
  else
    report FAIL "$(basename "${f}") 파일이 없습니다."
  fi
done

if grep -q 'ROOT_DIR.*\.env' "${ROOT_DIR}/scripts/dev-web.sh" && grep -q 'NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR' "${ROOT_DIR}/scripts/dev-web.sh"; then
  report PASS "dev-web.sh가 루트 env 로드 및 NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR 설정을 포함합니다."
else
  report FAIL "dev-web.sh에서 env 로드 또는 NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR 설정이 누락되었습니다."
fi

if grep -q 'ROOT_DIR.*\.env' "${ROOT_DIR}/scripts/dev-api.sh" && grep -q 'FIREBASE_AUTH_EMULATOR_HOST' "${ROOT_DIR}/scripts/dev-api.sh"; then
  report PASS "dev-api.sh가 루트 env 로드 및 FIREBASE_AUTH_EMULATOR_HOST 분기를 포함합니다."
else
  report FAIL "dev-api.sh에서 env 로드 또는 FIREBASE_AUTH_EMULATOR_HOST 분기가 누락되었습니다."
fi

ROOT_PKG="${ROOT_DIR}/package.json"
WEB_PKG="${ROOT_DIR}/apps/web/package.json"

if [[ -f "${ROOT_PKG}" ]]; then
  if json_script_exists "${ROOT_PKG}" "dev" && json_script_exists "${ROOT_PKG}" "dev:web" && json_script_exists "${ROOT_PKG}" "dev:web:real" && json_script_exists "${ROOT_PKG}" "dev:web:emulator"; then
    report PASS "루트 package.json에 dev 관련 scripts(dev, dev:web, dev:web:real, dev:web:emulator)가 존재합니다."
  else
    report FAIL "루트 package.json의 dev 관련 scripts가 누락되었습니다."
  fi
else
  report FAIL "루트 package.json이 없습니다."
fi

if [[ -f "${WEB_PKG}" ]]; then
  DEV_SCRIPT="$(json_script_value "${WEB_PKG}" "dev")"
  if [[ "${DEV_SCRIPT}" == *"MINDSIGHT_ROOT_DEV"* ]]; then
    report PASS "apps/web/package.json dev 가드(MINDSIGHT_ROOT_DEV)가 존재합니다."
  else
    report FAIL "apps/web/package.json dev 가드가 없습니다. apps/web 직접 실행 차단이 필요합니다."
  fi
else
  report FAIL "apps/web/package.json이 없습니다."
fi

USE_FIREBASE_AUTH_EMULATOR_VAL="$(get_var USE_FIREBASE_AUTH_EMULATOR)"
NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR_VAL="$(get_var NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR)"
NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST_VAL="$(get_var NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST)"
FIREBASE_AUTH_EMULATOR_HOST_VAL="$(get_var FIREBASE_AUTH_EMULATOR_HOST)"
NEXT_PUBLIC_FIREBASE_PROJECT_ID_VAL="$(get_var NEXT_PUBLIC_FIREBASE_PROJECT_ID)"
NEXT_PUBLIC_FIREBASE_API_KEY_VAL="$(get_var NEXT_PUBLIC_FIREBASE_API_KEY)"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN_VAL="$(get_var NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN)"
NEXT_PUBLIC_FIREBASE_APP_ID_VAL="$(get_var NEXT_PUBLIC_FIREBASE_APP_ID)"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID_VAL="$(get_var NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID)"
FIREBASE_PROJECT_ID_VAL="$(get_var FIREBASE_PROJECT_ID)"

echo
echo "--- Effective env (.env + .env.local override) ---"
echo "USE_FIREBASE_AUTH_EMULATOR=${USE_FIREBASE_AUTH_EMULATOR_VAL:-<empty>}"
echo "NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR=${NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR_VAL:-<empty>}"
echo "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=${NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST_VAL:-<empty>}"
echo "FIREBASE_AUTH_EMULATOR_HOST=${FIREBASE_AUTH_EMULATOR_HOST_VAL:-<empty>}"
echo

if [[ "${MODE}" == "emulator" ]]; then
  is_true "${USE_FIREBASE_AUTH_EMULATOR_VAL}" \
    && report PASS "USE_FIREBASE_AUTH_EMULATOR=true" \
    || report FAIL "USE_FIREBASE_AUTH_EMULATOR를 true로 설정하세요."

  is_true "${NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR_VAL}" \
    && report PASS "NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR=true" \
    || report FAIL "NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR를 true로 설정하세요."

  [[ -n "${NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST_VAL}" ]] \
    && report PASS "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST가 설정되어 있습니다." \
    || report FAIL "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST를 설정하세요. (예: 127.0.0.1:9099)"

  [[ -n "${FIREBASE_AUTH_EMULATOR_HOST_VAL}" ]] \
    && report PASS "FIREBASE_AUTH_EMULATOR_HOST가 설정되어 있습니다." \
    || report FAIL "FIREBASE_AUTH_EMULATOR_HOST를 설정하세요. (예: 127.0.0.1:9099)"
else
  is_false "${USE_FIREBASE_AUTH_EMULATOR_VAL}" \
    && report PASS "USE_FIREBASE_AUTH_EMULATOR=false" \
    || report FAIL "USE_FIREBASE_AUTH_EMULATOR를 false로 설정하세요."

  is_false "${NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR_VAL}" \
    && report PASS "NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR=false" \
    || report FAIL "NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR를 false로 설정하세요."

  [[ -z "${NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST_VAL}" ]] \
    && report PASS "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST가 비어 있습니다." \
    || report WARN "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST가 남아 있습니다. real 모드에서는 비우는 것을 권장합니다."

  [[ -z "${FIREBASE_AUTH_EMULATOR_HOST_VAL}" ]] \
    && report PASS "FIREBASE_AUTH_EMULATOR_HOST가 비어 있습니다." \
    || report WARN "FIREBASE_AUTH_EMULATOR_HOST가 남아 있습니다. real 모드에서는 비우는 것을 권장합니다."

  [[ -n "${NEXT_PUBLIC_FIREBASE_PROJECT_ID_VAL}" ]] \
    && report PASS "NEXT_PUBLIC_FIREBASE_PROJECT_ID가 설정되어 있습니다." \
    || report FAIL "NEXT_PUBLIC_FIREBASE_PROJECT_ID가 비어 있습니다."
  [[ -n "${NEXT_PUBLIC_FIREBASE_API_KEY_VAL}" ]] \
    && report PASS "NEXT_PUBLIC_FIREBASE_API_KEY가 설정되어 있습니다." \
    || report FAIL "NEXT_PUBLIC_FIREBASE_API_KEY가 비어 있습니다."
  [[ -n "${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN_VAL}" ]] \
    && report PASS "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN가 설정되어 있습니다." \
    || report FAIL "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN가 비어 있습니다."
  [[ -n "${NEXT_PUBLIC_FIREBASE_APP_ID_VAL}" ]] \
    && report PASS "NEXT_PUBLIC_FIREBASE_APP_ID가 설정되어 있습니다." \
    || report FAIL "NEXT_PUBLIC_FIREBASE_APP_ID가 비어 있습니다."
  [[ -n "${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID_VAL}" ]] \
    && report PASS "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID가 설정되어 있습니다." \
    || report FAIL "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID가 비어 있습니다."
  [[ -n "${FIREBASE_PROJECT_ID_VAL}" ]] \
    && report PASS "FIREBASE_PROJECT_ID가 설정되어 있습니다." \
    || report FAIL "FIREBASE_PROJECT_ID가 비어 있습니다."
fi

echo
echo "=== Summary ==="
echo "PASS: ${PASS_COUNT}"
echo "WARN: ${WARN_COUNT}"
echo "FAIL: ${FAIL_COUNT}"
echo

echo "=== 지금 실행해야 할 명령어 ==="
echo "1) 기존 서버 종료 (각 터미널에서 Ctrl+C)"
echo "2) 캐시 삭제: rm -rf apps/web/.next"
if [[ "${MODE}" == "emulator" ]]; then
  echo "3) make auth-emulator"
  echo "4) make api-dev-emulator"
  echo "5) npm run dev:web:emulator"
else
  echo "3) make api-dev-real"
  echo "4) npm run dev:web:real"
fi

if (( FAIL_COUNT > 0 )); then
  exit 1
fi
exit 0
