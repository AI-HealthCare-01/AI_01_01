# Acceptance Criteria

## 역할/권한
- [ ] Owner / Admin / Support 기본 역할 구현
- [ ] Support용 analyst_ml_extension 요청/승인 흐름 구현
- [ ] Owner는 전체 접근 가능
- [ ] Admin은 Support 범위 포함
- [ ] Support는 할당된 범위만 접근

## 사용자 조회/차단
- [ ] 사용자 목록에 IP 기본 비노출
- [ ] 제재 모달에서만 이메일/IP 노출
- [ ] 계정 차단 / IP 차단 복수 선택 가능
- [ ] 모든 차단 액션 audit_log 저장

## 승인형 변경
- [ ] 정책 변경은 Owner 승인 후에만 적용
- [ ] 모델 변경/배포는 Owner 승인 후에만 적용
- [ ] 승인 대기 목록/이력 조회 가능

## 알림/큐
- [ ] support_queue / moderation_queue / safety_queue / ops_queue / ml_queue 분리
- [ ] 큐별 건수를 운영 개요에서 확인 가능

## 통합
- [ ] support_feedback 재오픈 규칙과 연동
- [ ] board_feed 신고/탐지 큐와 연동
- [ ] 마이페이지 알림 트리거 문서화
