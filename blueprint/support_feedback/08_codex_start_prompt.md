# Codex 시작 프롬프트 (문의/피드백)

이 레포에 `blueprint/support_feedback/` 가 있다. 아래를 구현하라.

목표:
- 사용자가 문의/피드백을 비공개 티켓으로 작성
- 관리자가 답변하면 사용자에게 알림
- 사용자가 추가문의하면 같은 티켓이 reopened -> waiting_admin 으로 돌아가며 관리자 큐에 다시 나타남

제약:
1) 문의와 피드백은 하나의 티켓 시스템으로 구현하되 ticket_type으로만 구분한다.
2) 공개 게시판과 섞지 않는다.
3) 관리자 '처리 필요' 큐는 상태 기반(new/waiting_admin/reopened)이다. 단순 unread 아님.
4) 제목/내용은 필수, 첨부는 선택.
5) 피드백은 reply_requested 옵션이 있다.
6) 내부 메모는 사용자에게 보이지 않아야 한다.

최소 API:
- POST /v1/support/tickets
- GET /v1/support/tickets
- GET /v1/support/tickets/{ticket_id}
- POST /v1/support/tickets/{ticket_id}/followup
- POST /v1/support/tickets/{ticket_id}/resolve

추가 구현:
- support_notification 저장
- status history 저장
- 민감 키워드면 sensitive_queue_flag=true 처리 가능한 훅 추가

제출:
- 구현 파일
- README 업데이트
- 상태 전이 테스트(신규 작성 -> 관리자 답변 -> 사용자 추가문의 -> 관리자 큐 재등록)
