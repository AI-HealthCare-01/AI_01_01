# Current vs Blueprint Gap

기준:
- 루트 `AGENTS.md`
- `docs/repo-map.md`
- `docs/dev-workflow.md`
- `blueprint/*/AGENTS.md`, `blueprint/*/README.md`
- 실제 구현 코드(`apps/web/app/*`, `apps/web/src/*`, `apps/api/app/*`)

| feature | expected (from blueprint) | current | gap | action |
|---|---|---|---|---|
| global_navigation_ia | 핵심 기능은 메뉴/하위메뉴에서 접근 가능, 활동로그는 마이페이지 하위(blueprint/mypage) | 로그인 전/후 상위 메뉴 분리, 상위 메뉴 `대시보드` + 하위 메뉴(상태/활동/설문), `마이페이지` 하위 메뉴(활동로그 포함) 구성, 관리자 메뉴는 권한 사용자만 노출 | 주요 IA 충돌 해소 | keep |
| auth_account_signup_login | 회원가입/로그인/이메일확인/비밀번호재설정 + 이메일 미확인 제한 + 온보딩 강제 | `/auth/signup`, `/auth/login`, `/auth/verify-email`, `/auth/reset-password`, `AuthRouteGuard` 정책(`public-only`, `require-unverified`, `require-onboarding`) 구현 | 핵심 흐름은 구현됨 | keep |
| auth_account_verify_email_screen | 이메일 확인 대기 화면에 재발송/로그인 이동/이메일 변경하기 제공(blueprint/auth_account/05_frontend/screens.md) | `/auth/verify-email`에서 재발송/로그인 이동/이메일 변경 진입 제공, `/auth/change-email`에서 재인증 후 변경 메일 발송 처리 | blueprint 요구 충족(최근 재인증 포함) | keep |
| onboarding_baseline_flow | 온보딩에서 출생년도/성별/민감정보 동의 후 초기 진단척도 1회 완료 시 active 전환 | `/onboarding` + `/onboarding/assessment` 분리, baseline 완료 전 직접 점수 입력 차단 문구/로직 있음 | blueprint 핵심 요구와 정합 | keep |
| assessment_scales_periodic | 검증 문항 기반 입력, 결과/이력 제공, 문항/응답 임의 단순화 금지 | `/assessments`에서 `PHQ9_1` 같은 코드 라벨 + 셀렉트 점수 입력, 미응답 항목은 `0`으로 저장 | 실제 문항 텍스트 미노출, 무응답=0 처리로 설문 입력 품질 저하 가능 | rebuild |
| checkin_core | 45초 내 구조화 입력, raw/derived 분리, 홈 진입 전 checkin gate 고려(blueprint/checkin/data/checkin_component_map.csv) | `/checkin`에서 구조화 입력 + 저장/수정 + feature bundle 조회 구현 | 홈 진입 전 체크인 게이트(`CheckinGate`)는 화면 흐름에 명시적 적용 없음 | reconnect |
| challenge_core | 추천/노출/수락/수행/완료/중도포기 추적, 슬롯 규칙(최대3/도메인중복금지), 상세 흐름 | `/challenge`에서 추천/수락/수행/완료, 슬롯 규칙 에러 처리, exposure log 저장 구현 | 중도포기(dropout) UI/종료사유 입력 없음, 상세 화면 분리 없음 | rebuild |
| journal_crud | 상위 메뉴 `일기` CRUD, 목록은 preview만 노출, 활동로그 자동 반영 | `/journal`, `/journal/new`, `/journal/[entryId]`, `/journal/[entryId]/edit` 구현, preview 노출/상세 분리 | blueprint 핵심 요구와 정합 | keep |
| activity_log_day_summary | 마이페이지 하위 day summary 조회, 리스트/캘린더/필터, 원문 과노출 금지 | `/mypage/activity-log`에서 기간/모드/필터, 요약 + 원기능 링크 구현 | 기능은 맞지만 상위 메뉴에 별도 `활동로그` 노출로 IA 충돌 | reconnect |
| dashboard_state | 7일/4주 모드 + 우울/불안/불면 3개 그래프를 한 화면 단일 영역에 세로 배치 + 데이터 충분도 | `/dashboard/state`에서 모드 토글, 단일 카드 안 3개 라인차트, 설문일/권장일/밀도 배너 구현 | blueprint 핵심 요구와 대체로 정합 | keep |
| dashboard_activity | 체크인/챌린지/CBT/설문 요약 + 월간 캘린더 + 비게임화 | `/dashboard/activity`에서 4개 요약 카드, 캘린더, CBT/챌린지 요약 카드 구현 | blueprint 핵심 요구와 대체로 정합 | keep |
| report_summary | `/report/summary`, 8개 섹션, PDF/PNG export, 헤더 PII 제외, 위험 신호 include_sensitive 제어 | 8개 섹션 렌더 + PDF/PNG 내보내기 + 헤더 PII 제외 + include_sensitive 토글 구현 | 섹션 제목이 `0.`, `1.` 형태의 구현자 중심 표기(운영 카피 미완), ExportModal 분리 없음 | rebuild |
| board_feed_tabs_search | 피드/공지/북마크 탭, 최신순 + 더보기, 고유번호 검색 | `/board-feed`에서 3탭, limit 15, 더보기, 고유번호 검색 구현 | 핵심 탭/검색/더보기는 동작 | keep |
| board_feed_authoring_interaction | 글 작성(제목/본문/사진/익명), 댓글 상호작용, 본문 더보기, 카드 확장 규칙 | `/board-feed/new` 글쓰기 route 추가, 피드에서 좋아요/북마크/신고/검색/더보기 동작 | 댓글 작성/조회 및 본문 확장 UI 미완 | reconnect |
| support_feedback_user | 문의/피드백 통합 티켓, 재오픈, 사용자 알림, 본인 조회 | `/mypage/support-tickets`(내역), `/mypage/support-tickets/new`(작성), `/mypage/support-tickets/[ticketId]`(상세)로 접근 구조 분리 | 첨부(선택) UI/데이터 경로 미구현 | reconnect |
| support_feedback_admin | 관리자 문의 큐에서 처리/답변/상태전이/재오픈 이력 관리 | `/admin/support`는 큐 목록 중심, 상세 열람/답변 작성/상태 변경/내부 메모 UI 없음 | 관리자 처리 플로우 미완 | rebuild |
| mypage_hub | 마이페이지는 개인 허브 + 하위 기능 분리 + 빠른 진입 | `/mypage` + 권장 하위 라우트(`/profile`,`/security`,`/activity-log`,`/bookmarks`,`/my-posts`,`/my-comments`,`/support-tickets`,`/report-vault`,`/consents`) 구현 | 라우트 구성은 정합 | keep |
| mypage_profile_security_detail | 프로필(닉네임/출생년도/성별/이메일표시/인증상태/알림), 보안(비밀번호 변경 + 탈퇴) | 프로필 수정과 보안 분리는 구현, 비밀번호 변경/재설정 메일 있음 | 프로필 화면의 이메일/인증상태/알림설정 노출 부족, 보안 화면의 계정탈퇴 미구현 | rebuild |
| admin_console_roles_approval | Owner/Admin/Support(+extension), 승인형 정책/모델 반영, 감사로그 | `/admin/*` + 승인형 정책/모델/권한/감사 로그 라우트 구현 | 핵심 승인 구조 존재 | keep |
| admin_console_ops_depth | 모더레이션/문의 큐 화면에서 실제 처리 액션까지 제공, 제재/차단 관리 메뉴 | 모더레이션/문의는 리스트 중심, `/admin/restrictions` 전용 화면에서 계정/IP 차단 조치 지원 | 모더레이션/문의 큐의 상세 조치 액션 깊이는 여전히 부족 | reconnect |
| modeling_integration | model/ 번들 연결 nowcast 서빙 + 승인형 재학습 job 구조 | `/v1/modeling/runtime`, `/v1/modeling/nowcast/*`, `/v1/admin/model-ops/*/retraining-jobs` 존재 | 웹 사용자 화면에서 모델 상태/예측 결과를 직접 확인하는 운영 UI는 제한적 | reconnect |
| extra_internal_design_system | blueprint 기능 범위 외 내부 프리뷰는 운영 화면에서 분리/비노출 | 공개 `/design-system` 제거, 내부 전용 `/internal/design-system`으로 이동 | 내부 점검 경로는 유지되며 운영 메뉴에는 비노출 | keep |

## Preview/Showcase 잔존 화면
- 운영 사용자 화면 기준 잔존 항목 없음
- 내부 점검 전용 라우트: `/internal/design-system`

## Blueprint에 없는(또는 운영 범위를 벗어난) 임의/내부 기능
- `/internal/design-system` 내부 프리뷰 라우트(운영 메뉴 비노출)
