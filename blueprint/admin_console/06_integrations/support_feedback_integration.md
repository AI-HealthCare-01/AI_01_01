# support_feedback blueprint 연동

관리자페이지는 기존 support_feedback 설계와 이렇게 연결한다.

## 알림 대상
- 새 티켓(new/waiting_admin)
- 재오픈(reopened -> waiting_admin)
- 긴급/민감 문의는 safety_queue 또는 별도 강조

## 관리자 처리
- 답변 등록
- 상태 변경
- 내부 메모 기록
- 감사 로그 저장

## 사용자 측 연동
- 관리자 답변 후 사용자 마이페이지 알림 생성
- 사용자가 '추가문의'하면 같은 티켓이 다시 관리자 큐로 복귀
