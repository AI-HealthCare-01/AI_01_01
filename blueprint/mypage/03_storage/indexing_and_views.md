# 뷰/집계 규칙

## 사용자용 첫 화면 요약은 projection으로 계산
- 최근 7일 활동 집계는 원천 로그에서 ETL 또는 on-read aggregation
- 리포트 보관함은 report artifact metadata 기준
- 북마크, 내 글, 내 댓글은 board_feed projection 기준
- 문의 상태는 support_ticket projection 기준

## 권장 projection
- user_mypage_home_projection
- user_report_vault_projection
- user_board_activity_projection
- user_support_ticket_projection
