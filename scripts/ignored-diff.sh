#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TRACK_DIR="${IGNORED_TRACK_DIR:-${ROOT_DIR}/artifacts/ignored-tracking}"
BASELINE_FILE="${TRACK_DIR}/baseline.tsv"
CURRENT_FILE="${TRACK_DIR}/current.tsv"

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/ignored-diff.sh diff      # baseline 대비 .gitignore 대상 변경 확인
  ./scripts/ignored-diff.sh baseline  # baseline 생성/갱신

Optional env:
  IGNORED_TRACK_DIR=/custom/path
USAGE
}

ensure_git_repo() {
  if ! git -C "${ROOT_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "git 저장소가 아닙니다: ${ROOT_DIR}" >&2
    exit 1
  fi
}

ensure_track_dir() {
  mkdir -p "${TRACK_DIR}"
}

build_snapshot() {
  local out_file="$1"
  local tmp_file list_file filtered_file
  tmp_file="$(mktemp)"
  list_file="$(mktemp)"
  filtered_file="$(mktemp)"

  (
    cd "${ROOT_DIR}"
    git ls-files -o -i --exclude-standard -z > "${list_file}"
  )

  while IFS= read -r -d '' path; do
    if [ -f "${ROOT_DIR}/${path}" ]; then
      printf "%s\0" "${path}" >> "${filtered_file}"
    fi
  done < "${list_file}"

  if [ -s "${filtered_file}" ]; then
    (
      cd "${ROOT_DIR}"
      xargs -0 shasum -a 256 < "${filtered_file}"
    ) | awk '{
      hash=$1
      $1=""
      sub(/^  /, "", $0)
      printf "%s\t%s\n", $0, hash
    }' > "${tmp_file}"
  else
    : > "${tmp_file}"
  fi

  LC_ALL=C sort -t "$(printf '\t')" -k1,1 "${tmp_file}" > "${out_file}"
  rm -f "${tmp_file}" "${list_file}" "${filtered_file}"
}

write_baseline() {
  ensure_git_repo
  ensure_track_dir
  build_snapshot "${BASELINE_FILE}"
  cp "${BASELINE_FILE}" "${CURRENT_FILE}"
  local count
  count="$(wc -l < "${BASELINE_FILE}" | tr -d ' ')"
  echo "baseline 생성 완료: ${BASELINE_FILE}"
  echo "추적 파일 수: ${count}"
}

run_diff() {
  ensure_git_repo
  ensure_track_dir
  build_snapshot "${CURRENT_FILE}"

  if [ ! -f "${BASELINE_FILE}" ]; then
    cp "${CURRENT_FILE}" "${BASELINE_FILE}"
    local init_count
    init_count="$(wc -l < "${BASELINE_FILE}" | tr -d ' ')"
    echo "baseline이 없어 자동 생성했습니다."
    echo "baseline: ${BASELINE_FILE}"
    echo "추적 파일 수: ${init_count}"
    echo "다음 실행부터 변경 내역이 출력됩니다."
    exit 0
  fi

  local added_file removed_file changed_file
  added_file="$(mktemp)"
  removed_file="$(mktemp)"
  changed_file="$(mktemp)"

  awk -F '\t' \
    -v added="${added_file}" \
    -v removed="${removed_file}" \
    -v changed="${changed_file}" '
    NR==FNR { old[$1]=$2; next }
    { cur[$1]=$2 }
    END {
      for (p in old) {
        if (!(p in cur)) {
          print p >> removed
        } else if (old[p] != cur[p]) {
          print p >> changed
        }
      }
      for (p in cur) {
        if (!(p in old)) {
          print p >> added
        }
      }
    }
  ' "${BASELINE_FILE}" "${CURRENT_FILE}"

  LC_ALL=C sort -o "${added_file}" "${added_file}" || true
  LC_ALL=C sort -o "${removed_file}" "${removed_file}" || true
  LC_ALL=C sort -o "${changed_file}" "${changed_file}" || true

  local added_count removed_count changed_count
  added_count="$(wc -l < "${added_file}" | tr -d ' ')"
  removed_count="$(wc -l < "${removed_file}" | tr -d ' ')"
  changed_count="$(wc -l < "${changed_file}" | tr -d ' ')"

  echo "ignored 파일 변경 요약"
  echo "- baseline: ${BASELINE_FILE}"
  echo "- current : ${CURRENT_FILE}"
  echo "- added   : ${added_count}"
  echo "- removed : ${removed_count}"
  echo "- changed : ${changed_count}"

  if [ "${added_count}" -eq 0 ] && [ "${removed_count}" -eq 0 ] && [ "${changed_count}" -eq 0 ]; then
    echo
    echo "변경 없음"
  else
    if [ "${added_count}" -gt 0 ]; then
      echo
      echo "[added]"
      sed 's/^/- /' "${added_file}"
    fi
    if [ "${removed_count}" -gt 0 ]; then
      echo
      echo "[removed]"
      sed 's/^/- /' "${removed_file}"
    fi
    if [ "${changed_count}" -gt 0 ]; then
      echo
      echo "[changed]"
      sed 's/^/- /' "${changed_file}"
    fi
  fi

  rm -f "${added_file}" "${removed_file}" "${changed_file}"
}

main() {
  local cmd="${1:-diff}"
  case "${cmd}" in
    baseline)
      write_baseline
      ;;
    diff)
      run_diff
      ;;
    -h|--help|help)
      usage
      ;;
    *)
      echo "알 수 없는 명령: ${cmd}" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
