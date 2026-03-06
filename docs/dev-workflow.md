# Dev Workflow

## 목적

이 문서는 MindSight 모노레포의 로컬 개발, 검증, 협업 흐름을 정리한다.
기능 구현 전/중/후에 문서와 코드의 정합성을 유지하는 것을 목표로 한다.

## 1. 작업 시작 전 확인

1. 루트 `AGENTS.md` 확인
2. 대상 기능 `blueprint/<feature>/AGENTS.md` 확인
3. 대상 기능 `blueprint/<feature>/README.md` 확인

## 2. 모노레포 기본 구조

- Frontend: `apps/web` (Next.js + TypeScript)
- Backend: `apps/api` (FastAPI)
- Shared code: `packages/shared`, `packages/domain`
- Runtime DB(현재 기본): `AUTH_DATABASE_PATH` SQLite
- Local Docker stack: `infra/docker/docker-compose.yml` (`postgres + api + web`, optional auth emulator)

## 3. 로컬 부트스트랩

1. 웹 의존성 설치
   - `make web-install`
2. API 의존성 설치
   - `make api-install` (`apps/api[dev,ml]` 포함)
3. (선택) Postgres scaffold 기동
   - `make db-up`
4. 웹/API 실행(실 Firebase 기본)
   - `make web-dev-real`
   - `make api-dev-real`
5. (선택) Auth 이메일 링크 E2E 점검
   - `make auth-e2e`
6. (선택) Emulator 모드 실행
   - `make auth-emulator`
   - `make web-dev-emulator`
   - `make api-dev-emulator`

## 4. 개발 실행

- 웹 개발 서버: `make web-dev-real` (또는 `make web-dev-emulator`)
- API 개발 서버: `make api-dev-real` (또는 `make api-dev-emulator`)
- DB 중지: `make db-down`

기본 실행 스크립트는 실 Firebase 모드를 기본으로 동작한다.
- `dev-web.sh`: 실 Firebase 설정값이 없으면 실행 전 실패
- `dev-api.sh`: `USE_FIREBASE_AUTH_EMULATOR=false`일 때 `FIREBASE_PROJECT_ID` 필수
- continue URL 고정이 필요하면 `NEXT_PUBLIC_AUTH_CONTINUE_BASE_URL` 사용
- `USE_FIREBASE_AUTH_EMULATOR=true` 를 주면 emulator 연결 경로로 전환한다.

## 5. 품질 검증

각 작업 단위마다 최소 아래를 수행한다.

- lint: `make lint`
- test: `make test`
- smoke: `make smoke`
- build: `make build`
- type check: `make typecheck`

## 6. 브랜치/PR 원칙

- 기능 단위 브랜치로 분리
- PR은 작은 단위로 유지
- PR 본문에 아래 필수 포함
  - 변경 내용
  - blueprint 기준
  - 실행/검증 방법
  - 남은 TODO/리스크

## 7. 민감정보/안전 원칙

- 정신건강 데이터는 최소 수집/최소 노출
- 로그에 자유 텍스트 원문/민감정보를 과도하게 남기지 않음
- 관리자 기능은 최소 권한/최소 노출

## 8. 문서 동기화 원칙

코드 변경 시 최소 하나 이상 동시 업데이트:

- 루트 `README.md`
- `docs/repo-map.md`
- 관련 blueprint 메모
- 환경변수 문서(`.env.example`)
