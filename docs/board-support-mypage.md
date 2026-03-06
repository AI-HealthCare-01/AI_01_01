# Board Feed + Support Feedback + MyPage

## 구현 범위

- `board_feed`
  - 피드/공지/북마크 탭 API
  - 최신순 정렬 + cursor 기반 더보기
  - 피드 고유번호(`feed_public_id`) 검색
  - 좋아요/북마크/댓글/신고
  - 모더레이션 큐 분리: `report`, `hate`, `safety`
- `support_feedback`
  - 문의/피드백 통합 티켓 생성/목록/상세
  - 추가문의(`followup`) 시 재오픈(`reopened`)
  - 사용자 해결 처리(`resolve`)
  - 관리자 답변 등록 시 사용자 알림 생성
- `mypage`
  - 개인 허브 홈 요약 API
  - 하위 허브 API: 프로필/보안/북마크/내글/내댓글/내문의/리포트보관함/동의
  - 활동로그는 기존 `/v1/mypage/activity-log`와 연동

## API 엔드포인트

### Board Feed
- `GET /v1/board/feed`
- `GET /v1/board/notices`
- `GET /v1/board/bookmarks`
- `POST /v1/board/post`
- `POST /v1/board/post/{post_id}/like`
- `POST /v1/board/post/{post_id}/bookmark`
- `POST /v1/board/post/{post_id}/report`
- `POST /v1/board/post/{post_id}/comments`

### Moderation / Admin
- `GET /v1/admin/moderation/queues`
- `GET /v1/admin/support/queue-summary`
- `POST /v1/admin/support/tickets/{ticket_id}/reply`

### Support Feedback
- `POST /v1/support/tickets`
- `GET /v1/support/tickets`
- `GET /v1/support/tickets/{ticket_id}`
- `POST /v1/support/tickets/{ticket_id}/followup`
- `POST /v1/support/tickets/{ticket_id}/resolve`
- `GET /v1/support/notifications`
- `POST /v1/support/notifications/{notification_id}/read`

### MyPage
- `GET /v1/mypage/home`
- `PATCH /v1/mypage/profile`
- `POST /v1/mypage/security/password`
- `GET /v1/mypage/bookmarks`
- `GET /v1/mypage/my-posts`
- `GET /v1/mypage/my-comments`
- `GET /v1/mypage/support-tickets`
- `GET /v1/mypage/report-vault`
- `GET /v1/mypage/consents`
- `PATCH /v1/mypage/consents`

## 웹 라우트

- `/board-feed`
- `/mypage`
- `/mypage/profile`
- `/mypage/security`
- `/mypage/activity-log`
- `/mypage/bookmarks`
- `/mypage/my-posts`
- `/mypage/my-comments`
- `/mypage/support-tickets`
- `/mypage/report-vault`
- `/mypage/consents`
- `/admin`
- `/admin/users`
- `/admin/moderation`
- `/admin/support`
- `/admin/policies`
- `/admin/model-ops`
- `/admin/roles`
- `/admin/audit-log`

## 정책 반영 포인트

- 게시판 모더레이션은 신고/유해언어/안전 큐를 분리 저장한다.
- 문의/피드백은 공개 게시판이 아닌 비공개 티켓 스레드로 처리한다.
- 사용자 추가문의는 새 티켓이 아니라 기존 티켓 재오픈으로 처리한다.
- 마이페이지는 기능 허브로 유지하고, 상세 액션은 하위 화면으로 분리한다.
