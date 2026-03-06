# 상태 흐름

권장 상태값:
- new
- waiting_admin
- in_progress
- answered
- waiting_user
- reopened
- resolved
- closed

대표 흐름:
1) 사용자 최초 작성
   new -> waiting_admin
   -> 관리자 미답변 알림 생성

2) 관리자가 답변
   waiting_admin -> answered 또는 waiting_user
   -> 관리자 미답변 알림 제거
   -> 사용자 새 답변 알림 생성

3) 사용자가 해결됨 처리
   answered/waiting_user -> resolved
   -> 필요 시 closed

4) 사용자가 추가문의
   answered/waiting_user/resolved -> reopened -> waiting_admin
   -> 관리자 미답변 알림 재생성

5) 관리자가 내부 검토만 먼저 하는 경우
   waiting_admin -> in_progress
   -> 여전히 관리자 액션이 필요한 상태로 볼지 여부는 큐 규칙에서 결정
