# 큐/알림 규칙

## 관리자 '처리 필요' 큐에 표시되는 상태
- new
- waiting_admin
- reopened

## 선택적으로 같은 큐에 유지 가능한 상태
- in_progress
  - 운영정책에 따라 처리 중이지만 아직 사용자 답변 전이라면 유지 가능

## 관리자 큐에서 사라지는 상태
- answered
- waiting_user
- resolved
- closed

## 사용자 마이페이지 알림 트리거
- 관리자 답변 등록
- 상태가 answered / waiting_user / resolved / closed 로 바뀜
- 관리자 추가 설명 요청(선택)

## 관리자 알림 트리거
- 새 티켓 생성
- 사용자의 추가문의(is_followup=true)
- 민감/긴급 키워드 감지 시 민감 큐 라벨 부착
