# 관리자페이지 연동 요구사항

이 문서는 관리자페이지 blueprint에서 그대로 참조할 수 있도록 작성됨.

## 관리자 메인 큐(처리 필요)
보이는 티켓:
- new
- waiting_admin
- reopened
- (선택) in_progress

정렬 우선순위:
1. urgent
2. sensitive_queue_flag = true
3. 오래된 waiting_admin
4. 최근 reopened

## 관리자 상세에서 필요한 액션
- 답변 작성
- 상태 변경(in_progress / answered / waiting_user / closed)
- 내부 메모 작성
- 민감 플래그 수동 조정
- 카테고리 수정

## 답변 등록 시
- 관리자 처리 필요 큐에서 제거
- 사용자 알림 생성
- 상태 이력 저장

## 사용자가 추가문의 시
- 같은 티켓이 reopened -> waiting_admin
- 관리자 처리 필요 큐에 재등장
- '새 티켓'이 아니라 '재오픈' 배지 표시 권장
