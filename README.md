# MindSight Monorepo

MindSight 서비스의 웹/API/모델/인프라를 함께 운영하는 모노레포입니다.
구현 기준은 `blueprint/`이며, 민감정보/권한/안전 원칙을 우선합니다.

## 핵심 원칙

- 설계 원본: `blueprint/`
- 데이터/모델 자산: `model/`
- 기존 문서/자산은 삭제하지 않고 유지
- 기능은 작은 단위로 구현 + 검증 + 문서 동기화

## 디렉터리

- `apps/web` : Next.js + TypeScript 사용자/관리자 웹 앱
- `apps/api` : FastAPI 기반 API
- `packages/shared` : 공통 유틸/상수
- `packages/domain` : 도메인 타입/계약
- `infra/docker` : 로컬 Docker 실행(웹/API/Postgres/Auth Emulator 선택)
- `infra/aws` : AWS 인프라 코드/문서 위치
- `scripts` : 로컬 실행/검증 스크립트
- `docs` : 워크플로우/저장소 맵 문서

## 로컬 실행 (운영형 기본)

사전 조건:
- Node.js 20+
- Python 3.11+
- Docker
- 로컬 `firebase-tools` (`npm install` 시 dev dependency로 설치)

1. 웹 의존성 설치
   - `make web-install`
2. API 가상환경 및 의존성 설치
   - `make api-install`
3. (선택) 로컬 PostgreSQL 실행
   - `make db-up`
4. 웹 실행(실 Firebase)
   - `make web-dev-real`
5. API 실행(실 Firebase)
   - `make api-dev-real`

Docker로 한번에 실행(권장):
- `make docker-up`
- 웹: `http://localhost:3000`
- API: `http://localhost:8000/healthz`
- DB: `postgres://postgres:postgres@localhost:5432/mindsight_local`
- 종료: `make docker-down`
  - 기본 포트가 점유된 경우 `docker-up` 스크립트가 대체 포트(3001/8010/5433/9100/4001)를 자동 선택해 출력한다.
  - `docker-up/down`은 루트 `.env`를 자동 로드한다.
  - `USE_FIREBASE_AUTH_EMULATOR=false`여도 실 Firebase 필수값이 비어 있으면 `docker-up`은 자동으로 에뮬레이터 모드로 전환한다.
  - 실 Firebase를 강제로 쓰려면 `.env`에 `NEXT_PUBLIC_FIREBASE_*`, `FIREBASE_PROJECT_ID`를 모두 채운 뒤 `make docker-up-real`을 사용한다.
  - 에뮬레이터 모드는 `make docker-up-emulator` 또는 `USE_FIREBASE_AUTH_EMULATOR=true make docker-up` 으로 실행한다.

EC2에서 외부 접속 테스트 시 추가 설정:
- 루트 `.env`의 `CORS_ALLOW_ORIGINS`에 `http://<EC2_PUBLIC_IPV4>:3000` 추가
- AWS Security Group Inbound 허용(테스트용)
  - TCP `3000` from `0.0.0.0/0` (웹)
  - TCP `8000` from `0.0.0.0/0` (API)

에뮬레이터 로컬 개발:
- Auth Emulator: `make auth-emulator`
- 웹: `make web-dev-emulator`
- API: `make api-dev-emulator`
- 빠른 실행(웹만): `npm run dev` (기본값은 실 Firebase, 에뮬레이터는 `npm run dev:web:emulator`)

현재 API 저장소 기본값:
- `AUTH_DATABASE_PATH` 기반 SQLite 파일 저장(`apps/api/.data/auth_account.db`)
- `DATABASE_URL`/`make db-up`은 Postgres 전환 및 인프라 스캐폴드 검증용

## 인증/온보딩 구현 범위

- Firebase Auth 기반 이메일/비밀번호 회원가입/로그인
- 이메일 확인 메일 재전송 및 미확인 계정 주요 기능 접근 제한
- 비밀번호 재설정 메일 발송 플로우
- 첫 로그인 후 온보딩 강제
  - 민감정보 동의(필수), 개인화/모델개선 동의(선택)
  - 출생년도(YYYY) 수집 및 파생 나이 저장
  - 성별 선택(선택)
  - 초기 진단척도 1회 완료 시 `baseline` 저장
- 내부 ID 분리 저장
  - `user_id`
  - `firebase_uid`
  - `ml_subject_id` (`real_ml_YYYY_serial8`)

## 코어 입력 구현 범위

- Check-in: 일일 구조화 입력 + 파생 feature 저장
- Assessments: PHQ-9/GAD-7/ISI 세션/응답/완료/이력
- Challenge: 카탈로그/추천/참여/일별 수행 로그
- Journal: 상위 메뉴 CRUD(목록/상세/수정/삭제)
- Activity Log: 마이페이지 하위 day summary(리스트/캘린더)

## CBT/대시보드/요약리포트 구현 범위

- CBT: 대화형 세션 + JSON Schema 기반 구조화 출력 + 위험 신호 분리 저장
  - `POST /v1/cbt/conversation/turn` (LLM 기반 응답, 키 미설정 시 fallback)
- 상태 대시보드: `7d`, `4w_weekly_avg` 모드 + 우울/불안/불면 3개 그래프 세로 배치
- 활동 대시보드: 체크인/챌린지/CBT/설문 요약 + 월간 캘린더
- 요약리포트: 미리보기 + PDF/PNG 내보내기
  - 리포트 헤더에 이름/닉네임 제외
  - 위험 플래그는 구조화 신호만 표시

## 게시판/문의/마이페이지 구현 범위

- 게시판: 피드/공지/북마크 탭 + 최신순 더보기 + 고유번호 검색
- 모더레이션: 신고/유해언어/안전 큐 분리
  - 1차 규칙 기반 키워드 필터 유지
  - 2차 선택형 `kcELECTRA` 유해언어 모델 연동(`BOARD_TOXIC_MODEL_ENABLED=true`)
- 문의/피드백: 티켓 생성/상세/재오픈 + 사용자 알림
- 마이페이지: 개인 허브(회원정보/보안/활동로그/북마크/내글/내댓글/내문의/리포트보관함/동의)

## 관리자 콘솔 구현 범위

- 역할: Owner/Admin/Support + Support 확장 권한(`analyst_ml_extension`) 신청/심사
- 사용자 목록 기본 화면 IP 비노출, 차단 모달에서만 이메일/IP 노출
- 차단 액션: 계정 차단/ IP 차단 복수 선택
- 운영 메뉴: 모더레이션 / 문의 큐 / 정책 관리 / 모델 운영 / 권한 관리 / 감사 로그
- 승인형 변경
  - 정책 수정: Owner 승인 후 적용
  - 모델 변경/배포/롤백: Owner 승인 후 반영

## ML 연결 구현 범위

- 모델 서빙 API
  - `GET /v1/modeling/runtime`
  - `POST /v1/modeling/nowcast/predict`
  - `GET /v1/modeling/nowcast/history`
- `make api-install`은 API 기본 개발 의존성과 함께 모델 런타임 extra(`ml`)를 설치
- 모델 계약(`model/contracts/*.json`)을 단일 진실원천으로 사용
- 기본 백엔드는 `baseline`이며, 가중치 없이도 API/웹 동작
- `MODEL_BACKEND=artifact` + `MODEL_ARTIFACT_PATH`가 설정된 경우에만 가중치 로딩 시도
  - artifact 로딩 실패 시 자동 baseline fallback
- 누락 feature는 계약의 default 값으로 보정
- 예측 이력은 `model_nowcast_prediction` 테이블에 저장(옵션)
- 모델 재학습은 승인형 job 스캐폴드로 관리
  - `POST /v1/admin/model-ops/{model_change_id}/retraining-jobs`
  - `GET /v1/admin/model-ops/{model_change_id}/retraining-jobs`
  - `POST /v1/admin/model-ops/retraining-jobs/{job_id}/transition`
  - Owner 승인 전: `pending_owner_approval`, 승인 후 자동 `queued`

## Firebase 설정

`.env.example` 기준:

- 웹:
  - `NEXT_PUBLIC_FIREBASE_*`
  - `NEXT_PUBLIC_FIREBASE_AUTH_LANGUAGE_CODE=ko` (인증/재설정 메일 템플릿 언어)
  - `NEXT_PUBLIC_AUTH_CONTINUE_BASE_URL=http://localhost:3000`
- API:
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_ADMIN_PROJECT_ID`(미설정 시 `FIREBASE_PROJECT_ID` 사용)
  - `MODEL_BUNDLE_DIR=./model`
  - `MODEL_BACKEND=baseline` (기본)
  - `MODEL_ARTIFACT_PATH` (artifact 모드에서만)

## 모니터링 설정

- `NEXT_PUBLIC_GA_MEASUREMENT_ID`
  - 값이 있으면 웹 전역에 Google Analytics 4 페이지 추적을 활성화한다.
- `NEXT_PUBLIC_SENTRY_DSN`
  - 브라우저 런타임 오류 추적용 DSN이다.
- `SENTRY_DSN`
  - 서버/엣지 런타임 오류 추적용 DSN이다.
- `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_TRACES_SAMPLE_RATE`
  - 성능 트레이스 샘플링 비율이다. 기본값은 `0.1`.
- `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `SENTRY_RELEASE`
  - 배포 파이프라인에서 릴리즈 식별자와 소스맵 업로드를 붙일 때 사용할 값이다.
  - 네 값이 모두 있으면 `apps/web/next.config.mjs`가 `withSentryConfig`를 활성화해 운영 빌드에서 sourcemap 업로드를 시도한다.
  - `SENTRY_RELEASE`는 보통 git sha를 넣는다.
- 개인정보/민감정보 보호를 위해 기본 설정에서 이메일/IP/cookie/request body/session replay는 수집하지 않는다.

실 Firebase 실행 예시:
- 로컬 프로세스: `make web-dev-real` + `make api-dev-real`
- Docker: `make docker-up-real`

Firebase Emulator 실행 예시:
- Auth Emulator: `make auth-emulator`
- 로컬 프로세스: `make web-dev-emulator` + `make api-dev-emulator`
- Docker: `make docker-up-emulator`

Auth Emulator 링크 E2E 검증:
- `make auth-e2e`
- 결과로 `VERIFY_EMAIL_LINK`, `PASSWORD_RESET_LINK`, `*_CONTINUE_URL`을 출력한다.

터미널 링크 수동 테스트:
1. `make auth-emulator` 실행 후 링크 로그를 확인한다.
2. `To verify the email address ... follow this link:` 줄의 URL을 브라우저에서 연다.
3. `To reset the password ... follow this link:` 줄의 URL을 브라우저에서 연다.
4. 완료 후 continue URL(`/auth/verify-email`, `/auth/login`)로 돌아오는지 확인한다.

Firebase 메일 템플릿 권장:
- Firebase Console → Authentication → Templates
- 발신자 이름: `midnight`
- 제목/본문: 한글 텍스트로 변경
- `%LINK%`는 버튼 형태(`<a>`)로만 노출하고 텍스트 URL은 제거

## AWS 배포 스캐폴드

- 위치: `infra/aws`
- 포함:
  - Terraform 모듈(웹/API ECS, RDS Postgres, S3 파일 버킷)
  - 환경 분리(`staging`, `prod`)
  - Dockerfile 초안(`infra/aws/docker`)
  - GitHub Actions 초안(`.github/workflows/aws-deploy-staging.yml`, `aws-deploy-prod.yml`)
- 상세 사용법: `infra/aws/README.md`

## 검증 명령

- 전체 lint: `make lint`
- 전체 test: `make test`
- 최소 smoke: `make smoke`
- 웹+패키지 build: `make build`
- 웹 typecheck: `make typecheck`

## 참고 문서

- [개발 워크플로우](docs/dev-workflow.md)
- [저장소 맵](docs/repo-map.md)
- [인증/계정/온보딩 구현](docs/auth-account.md)
- [코어 입력 구현](docs/core-inputs.md)
- [CBT/대시보드/요약리포트 구현](docs/cbt-dashboard-report.md)
- [게시판/문의/마이페이지 구현](docs/board-support-mypage.md)
- [관리자 콘솔 구현](docs/admin-console.md)
- [모델 서빙/재학습 스캐폴드](docs/ml-serving-retraining.md)
- [리뷰/QA/운영 점검 체크리스트](docs/qa-ops-checklist.md)
- [보안 원칙](docs/security.md)
- [API 계약 원칙](docs/api-contracts.md)
