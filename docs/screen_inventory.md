# Screen Inventory

기준: `apps/web/app/**/page.tsx`, `apps/web/src/components/ui/index.tsx`, `apps/web/src/features/admin-console/shell.tsx`

| screen_id | route | visible_menu | auth_required | role_required | current_status |
|---|---|---|---|---|---|
| home | `/` | 로그인 전/후 상단 메뉴 + 홈 빠른 링크 카드 | optional (비로그인 접근 가능, 데이터는 active 사용자 기준 로드) | guest/signed-in | implemented |
| auth_signup | `/auth/signup` | 로그인 전 상단 메뉴 | public-only | guest only | implemented |
| auth_login | `/auth/login` | 로그인 전 상단 메뉴 | public-only (`?force=1` 예외) | guest only | implemented |
| auth_reset_password | `/auth/reset-password` | 서비스 상단 메뉴 | public-only | guest only | implemented |
| auth_verify_email | `/auth/verify-email` | 서비스 상단 메뉴 | require-unverified | signed_in_unverified | implemented |
| auth_change_email | `/auth/change-email` | 이메일 확인 화면에서 진입 | require-unverified | signed_in_unverified | implemented |
| onboarding_profile | `/onboarding` | 서비스 상단 메뉴 | require-onboarding | signed_in_verified_not_active | implemented |
| onboarding_assessment | `/onboarding/assessment` | 서비스 상단 메뉴 | require-onboarding | signed_in_verified_not_active | implemented |
| checkin_today | `/checkin` | 서비스 상단 메뉴 | require-active | signed_in_active | implemented |
| assessments_periodic | `/assessments` | 대시보드 하위 메뉴 | require-active | signed_in_active | implemented |
| challenge | `/challenge` | 서비스 상단 메뉴 | require-active | signed_in_active | implemented |
| journal_list | `/journal` | 서비스 상단 메뉴 | require-active | signed_in_active | implemented |
| journal_create | `/journal/new` | 서비스 상단 메뉴 | require-active | signed_in_active | implemented |
| journal_detail | `/journal/[entryId]` | 서비스 상단 메뉴 | require-active | signed_in_active(owner data) | implemented |
| journal_edit | `/journal/[entryId]/edit` | 서비스 상단 메뉴 | require-active | signed_in_active(owner data) | implemented |
| mypage_home | `/mypage` | 서비스 상단 메뉴 + 마이페이지 허브 하위링크 | require-active | signed_in_active | implemented |
| mypage_profile | `/mypage/profile` | 서비스 상단 메뉴 | require-active | signed_in_active | partial (이메일/인증상태/알림설정 노출 제한) |
| mypage_security | `/mypage/security` | 서비스 상단 메뉴 | require-active | signed_in_active | partial (계정탈퇴 미구현) |
| mypage_activity_log | `/mypage/activity-log` | 서비스 상단 메뉴 + 마이페이지 하위링크 | require-active | signed_in_active | implemented (활동 요약 통합) |
| mypage_bookmarks | `/mypage/bookmarks` | 서비스 상단 메뉴 + 마이페이지 하위링크 | require-active | signed_in_active | implemented |
| mypage_my_posts | `/mypage/my-posts` | 서비스 상단 메뉴 + 마이페이지 하위링크 | require-active | signed_in_active | implemented |
| mypage_my_comments | `/mypage/my-comments` | 서비스 상단 메뉴 + 마이페이지 하위링크 | require-active | signed_in_active | implemented |
| mypage_support_tickets | `/mypage/support-tickets` | 서비스 상단 메뉴 + 마이페이지 하위링크 | require-active | signed_in_active | partial (첨부 미지원) |
| mypage_support_tickets_new | `/mypage/support-tickets/new` | 마이페이지 허브 또는 문의내역 화면 액션 | require-active | signed_in_active | implemented (첨부 미지원) |
| mypage_support_tickets_detail | `/mypage/support-tickets/[ticketId]` | 문의내역 목록의 상세 화면 링크 | require-active | signed_in_active(owner ticket) | implemented (첨부 미지원) |
| mypage_report_vault | `/mypage/report-vault` | 서비스 상단 메뉴 + 마이페이지 하위링크 | require-active | signed_in_active | implemented |
| mypage_consents | `/mypage/consents` | 서비스 상단 메뉴 + 마이페이지 하위링크 | require-active | signed_in_active | implemented |
| dashboard | `/dashboard` | 서비스 상단 메뉴 + 대시보드 하위 메뉴 | require-active | signed_in_active | implemented |
| dashboard_state_redirect | `/dashboard/state` | 레거시 경로(자동 리다이렉트) | require-active | signed_in_active | redirect_to_dashboard |
| dashboard_activity_redirect | `/dashboard/activity` | 레거시 경로(자동 리다이렉트) | require-active | signed_in_active | redirect_to_mypage_activity_log |
| cbt_session | `/cbt` | 서비스 상단 메뉴 | require-active | signed_in_active | implemented |
| cbt_session_alias | `/cbt/session` | 홈 빠른 액션(세션 바로 시작) | require-active | signed_in_active | implemented |
| report_summary | `/report/summary` | 마이페이지 하위 메뉴(리포트 보관함 경유 진입) | require-active | signed_in_active | implemented (운영 카피 마감 필요) |
| board_feed | `/board-feed` | 서비스 상단 메뉴 + 피드 탭(피드/공지/북마크) | require-active | signed_in_active | partial (댓글 작성/조회 UI 미완) |
| board_feed_new | `/board-feed/new` | 게시판 화면 액션(글쓰기) | require-active | signed_in_active | implemented |
| admin_overview | `/admin` | 서비스 상단 메뉴 + 관리자 사이드바(권한 기반) | require-active (admin layout) | admin_role_assigned | implemented |
| admin_users | `/admin/users` | 서비스 상단 메뉴 + 관리자 사이드바(권한 기반) | require-active (admin layout) | support(view) / admin-owner(restriction action) | implemented |
| admin_restrictions | `/admin/restrictions` | 관리자 사이드바(권한 기반) | require-active (admin layout) | admin_or_owner | implemented |
| admin_moderation | `/admin/moderation` | 서비스 상단 메뉴 + 관리자 사이드바(권한 기반) | require-active (admin layout) | admin_or_owner (API에서 support 제한) | partial (조치 액션 UI 제한) |
| admin_support | `/admin/support` | 서비스 상단 메뉴 + 관리자 사이드바(권한 기반) | require-active (admin layout) | admin_role_assigned | partial (상세/답변/상태전이 UI 없음) |
| admin_policies | `/admin/policies` | 서비스 상단 메뉴 + 관리자 사이드바(권한 기반) | require-active (admin layout) | policy permission 보유자 | implemented |
| admin_model_ops | `/admin/model-ops` | 서비스 상단 메뉴 + 관리자 사이드바(권한 기반) | require-active (admin layout) | model_ops permission 보유자 | implemented |
| admin_roles | `/admin/roles` | 서비스 상단 메뉴 + 관리자 사이드바(권한 기반) | require-active (admin layout) | owner/admin/support(기능별 권한 차등) | implemented |
| admin_audit_log | `/admin/audit-log` | 서비스 상단 메뉴 + 관리자 사이드바(권한 기반) | require-active (admin layout) | audit permission 보유자 | implemented |
| design_system_preview | `/internal/design-system` | 운영 메뉴 비노출(내부 점검용) | none | guest/signed-in | internal_only |
