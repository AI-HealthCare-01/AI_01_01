# Codex 작업 규칙 (관리자페이지)

## 역할
- Owner
  - 모든 메뉴 접근 가능
  - 관리자 권한 부여/회수 가능
  - 정책 변경 승인 가능
  - 모델 배포/롤백 승인 가능
- Admin
  - 운영 개요, 사용자 관리, 커뮤니티 모더레이션, 문의/피드백, 정책 초안 수정, 차단 관리, 모델 모니터링 접근 가능
  - Owner 승인 없이는 정책 변경 반영/모델 배포 불가
  - Support 권한 범위도 포함
- Support
  - 문의/피드백 처리, 제한적 사용자 조회, 일부 운영 큐 접근
  - 기본적으로 IP 상세, 차단 실행, 정책 수정, 모델 배포 불가
  - 필요 시 `analyst_ml_extension` 권한 신청 가능
  - 확장 권한은 Owner 또는 Admin이 검토하고, 최종 반영/배포는 Owner 승인 필요

## 필수 제약
1. 사용자 목록 화면 기본 컬럼에 IP 주소를 노출하지 않는다.
2. 특정 계정 제재 화면에서만 이메일/최근 IP를 상세 노출한다.
3. 차단 UI는 `계정 차단`, `IP 차단`을 분리한 복수 선택으로 구현한다.
4. 모든 정책 수정 및 모델 변경은 `draft -> pending_owner_approval -> approved/rejected -> applied` 상태 흐름을 갖는다.
5. 관리자 알림은 큐별로 분리한다:
   - support_queue
   - moderation_queue
   - safety_queue
   - ops_queue
   - ml_queue
6. 모든 민감 액션은 `audit_log`에 기록한다.
