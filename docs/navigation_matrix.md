# Navigation Matrix

기준:
- 공통 상단 메뉴: `apps/web/src/components/ui/index.tsx` (`PUBLIC_NAV_ITEMS`, `AUTH_NAV_ITEMS`)
- 하위 메뉴: `apps/web/src/components/ui/index.tsx` (`DASHBOARD_SUB_NAV_ITEMS`, `MYPAGE_SUB_NAV_ITEMS`, `BOARD_SUB_NAV_ITEMS`)
- 관리자 접근 조건: `apps/web/src/components/ui/index.tsx` (`getAdminMe` 성공 시 `관리자 콘솔` 노출)

| menu_name | submenu_name | route | reachable_feature | missing_or_ok |
|---|---|---|---|---|
| 로그인 전 메뉴 | 랜딩 | `/` | 서비스 랜딩/초기 진입 | ok |
| 로그인 전 메뉴 | 로그인 | `/auth/login` | 로그인 | ok |
| 로그인 전 메뉴 | 회원가입 | `/auth/signup` | 회원가입 | ok |
| 인증 분기 | 이메일 확인 대기 | `/auth/verify-email` | 이메일 미인증 사용자 분기 처리 | ok |
| 인증 분기 | 이메일 변경 | `/auth/change-email` | 재인증 후 이메일 변경 메일 발송 | ok |
| 인증 분기 | 비밀번호 재설정 | `/auth/reset-password` | 비밀번호 재설정 메일 발송 | ok |
| 로그인 후 상위 메뉴 | 홈 | `/` | 홈 허브 | ok |
| 로그인 후 상위 메뉴 | 체크인 | `/checkin` | 코어 입력(체크인) | ok |
| 로그인 후 상위 메뉴 | 대시보드 | `/dashboard` | 대시보드(상태 추세) | ok |
| 로그인 후 상위 메뉴 | CBT | `/cbt` | CBT 세션 | ok |
| CBT 세션 진입 | 세션 화면 | `/cbt/session` | CBT 대화/세션 저장 | ok |
| 로그인 후 상위 메뉴 | 챌린지 | `/challenge` | 코어 입력(챌린지) | ok |
| 로그인 후 상위 메뉴 | 일기 | `/journal` | 일기 CRUD | ok |
| 로그인 후 상위 메뉴 | 게시판 | `/board-feed` | 피드/공지/북마크 | ok |
| 게시판 내부 진입 | 글쓰기 | `/board-feed/new` | 게시글 작성 | ok |
| 로그인 후 상위 메뉴 | 마이페이지 | `/mypage` | 개인 허브 | ok |
| 대시보드 하위 메뉴 | 대시보드 | `/dashboard` | 우울/불안/불면 추세 대시보드 | ok |
| 대시보드 하위 메뉴 | 활동 로그 | `/mypage/activity-log` | 활동 요약 + day summary 로그 | ok |
| 대시보드 하위 메뉴 | 설문 | `/assessments` | 정기 설문(assessment_scales) | ok |
| 마이페이지 하위 메뉴 | 회원정보 | `/mypage/profile` | 프로필 수정 | ok |
| 마이페이지 하위 메뉴 | 보안 설정 | `/mypage/security` | 비밀번호 변경/보안 설정 | ok |
| 마이페이지 하위 메뉴 | 활동 로그 | `/mypage/activity-log` | day summary 활동로그 | ok |
| 마이페이지 하위 메뉴 | 북마크 | `/mypage/bookmarks` | 게시글 북마크 | ok |
| 마이페이지 하위 메뉴 | 내 글 | `/mypage/my-posts` | 작성 글 목록 | ok |
| 마이페이지 하위 메뉴 | 내 댓글 | `/mypage/my-comments` | 작성 댓글 목록 | ok |
| 마이페이지 하위 메뉴 | 내 문의내역 | `/mypage/support-tickets` | 문의/피드백 티켓 | ok |
| 문의 내부 진입 | 문의 작성 | `/mypage/support-tickets/new` | 문의/피드백 티켓 생성 | ok |
| 문의 내부 진입 | 문의 상세 | `/mypage/support-tickets/[ticketId]` | 티켓 메시지/재오픈/해결 처리 | ok |
| 마이페이지 하위 메뉴 | 리포트 보관함 | `/mypage/report-vault` | 리포트 이력/요약리포트 진입 | ok |
| 마이페이지 하위 메뉴 | 동의 설정 | `/mypage/consents` | 동의/개인정보 설정 | ok |
| 권한 기반 메뉴 | 관리자 콘솔 | `/admin` | 관리자 콘솔 진입점 | ok (권한 사용자만 노출) |
| 관리자 하위 메뉴 | 제재/차단 | `/admin/restrictions` | 계정/IP 차단 조치 + 제한적 PII 컨텍스트 | ok (Admin/Owner) |
| 내부 전용 | 디자인 시스템 프리뷰 | `/internal/design-system` | 내부 UI 점검 | ok (운영 메뉴 비노출) |

## 접근성 요약 (핵심 기능)

| feature | primary_reach_path | status |
|---|---|---|
| 인증(로그인/회원가입) | 로그인 전 상단 메뉴 | ok |
| 온보딩 | 로그인 후 상태 전이(`/onboarding`) | ok |
| 체크인 | 로그인 후 상위 메뉴 `체크인` | ok |
| 설문 | 상위 메뉴 `대시보드` → 하위 메뉴 `설문` | ok |
| 챌린지 | 로그인 후 상위 메뉴 `챌린지` | ok |
| 일기 | 로그인 후 상위 메뉴 `일기` | ok |
| 활동로그 | 상위 메뉴 `마이페이지` → 하위 메뉴 `활동 로그` | ok |
| 대시보드(상태) | 상위 메뉴 `대시보드` | ok |
| 활동로그(활동 요약 통합) | 상위 메뉴 `마이페이지` → 하위 메뉴 `활동 로그` | ok |
| CBT | 로그인 후 상위 메뉴 `CBT` | ok |
| CBT 세션 화면 | `/cbt` 또는 `/cbt/session` | ok |
| 게시판 | 로그인 후 상위 메뉴 `게시판` → 내부 `글쓰기` | ok |
| 문의/피드백 | 상위 메뉴 `마이페이지` → 하위 메뉴 `내 문의내역` → `문의 작성/상세` | ok |
| 리포트 보관함/요약리포트 진입 | 상위 메뉴 `마이페이지` → 하위 메뉴 `리포트 보관함` | ok |
| 관리자 콘솔 | 권한 사용자 전용 상위 메뉴 `관리자 콘솔` | ok |
