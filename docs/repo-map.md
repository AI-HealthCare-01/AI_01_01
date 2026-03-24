# Repo Map

## 목적

MindMe 저장소의 현재 모노레포 구조와 각 디렉터리 역할을 빠르게 파악하기 위한 문서.

## 루트 구조

```text
project/
  blueprint/                      # 기능 설계 원본 (source of truth)
  model/                          # 데이터셋/메트릭/스키마/모델 자산
  apps/
    web/                          # Next.js 웹 앱
    api/                          # FastAPI 앱 (현재 기본 저장소: SQLite)
  packages/
    shared/                       # 공통 유틸/상수
    domain/                       # 도메인 타입/계약
    cbt-engine/                   # CBT 로직 확장 위치 (현재 비어 있음)
    ui/                           # 공통 UI 확장 위치 (현재 비어 있음)
  infra/
    aws/                          # AWS 인프라 코드/문서 위치
      terraform/
        modules/stack/            # ECS(web/api) + RDS + S3 스택 모듈
        environments/             # staging/prod 환경 분리
      docker/                     # 배포용 Dockerfile 초안(web/api)
    docker/
      docker-compose.yml          # 로컬 Docker 실행(web/api/postgres/auth-emulator)
  .github/
    workflows/
      aws-deploy-staging.yml      # staging 배포 초안
      aws-deploy-prod.yml         # prod 배포 초안
  scripts/                        # 로컬 실행/검증 스크립트
  design/
    style_brief.md
    component_rules.md
    reference_images/
  docs/
    dev-workflow.md
    repo-map.md
    blueprint-alignment.md
    security.md
    api-contracts.md
    ml-serving-retraining.md
    qa-ops-checklist.md
  package.json                    # Node workspace 진입점
  tsconfig.base.json              # TS 공통 설정
  Makefile                        # 공통 실행 명령
  .env.example                    # 환경변수 샘플
  AGENTS.md
  README.md
```

## 앱별 핵심 파일

### `apps/web`

- `app/layout.tsx`, `app/page.tsx`: 공통 앱 셸 + 홈 운영 허브(API 연동)
- `src/features/shared/api-base.ts`: API base URL fallback(8000/8010) 공통 유틸
- `app/cbt`: CBT 대화형 세션 + 구조화 저장 화면
- `app/checkin`, `app/assessments`, `app/challenge`: 코어 입력 화면
- `app/journal/*`: 일기 CRUD 화면
- `app/mypage/activity-log`: 마이페이지 하위 활동 요약 + day summary 통합 화면
- `app/dashboard`: 상태 추세 대시보드(기존 `/dashboard/state` 리다이렉트 포함)
- `app/report/summary`: 요약 리포트 미리보기 + 내보내기 화면
- `app/admin/*`: 관리자 콘솔(운영개요/사용자/모더레이션/문의큐/정책/모델/권한/감사로그)
- `package.json`: Next.js 실행/빌드/lint/typecheck/test 스크립트
- `tests/smoke.test.mjs`: 워크스페이스 연결 스모크 테스트

### `apps/api`

- `app/main.py`: FastAPI 엔트리 및 `/healthz`
- `app/core_inputs/*`: checkin/assessment/challenge/journal/activity-log API + 저장소
- `app/insights/*`: CBT + dashboard + report-summary API + export 로직
- `app/admin_console/*`: 관리자 콘솔 API(권한/차단/정책/모델/승인/감사로그)
- `app/modeling/*`: nowcast 모델 서빙 API + 예측 이력 저장
- `pyproject.toml`: API/개발 의존성 정의
- `tests/test_healthz.py`: 헬스 체크 테스트
- `tests/test_core_inputs_flow.py`: 코어 입력 + day summary 통합 플로우 테스트
- `tests/test_cbt_dashboard_report_flow.py`: CBT/대시보드/리포트 통합 플로우 테스트
- `tests/test_admin_console_flow.py`: 관리자 권한/승인 플로우 통합 테스트
- `tests/test_modeling_flow.py`: nowcast 서빙 + 승인형 재학습 job 통합 테스트

## 실행 명령 요약

- DB 시작: `make db-up`
- Docker 통합 실행(실 Firebase 기본): `make docker-up`
- Docker 통합 실행(Emulator): `make docker-up-emulator`
- Firebase Auth Emulator 시작(단독): `make auth-emulator`
- Auth 링크 E2E 점검: `make auth-e2e`
- 웹 실행: `make web-dev-real` (`make web-dev-emulator`)
- API 실행: `make api-dev-real` (`make api-dev-emulator`)
- lint: `make lint`
- test: `make test`
- smoke: `make smoke`
- build: `make build`
- typecheck: `make typecheck`
