# Admin Console

## 구현 범위

- 역할 체계
  - `owner`: 전체 권한 + 정책/모델 최종 승인 + 배포/롤백 + 권한 부여
  - `admin`: 운영/모더레이션/문의/정책초안/모델편집 + Support 범위 포함
  - `support`: 기본 조회/문의 처리, 필요 시 `analyst_ml_extension` 신청
- 최소 노출 원칙
  - 사용자 목록 기본 화면: IP 비노출
  - 제재/차단 모달에서만 이메일/최근 IP 노출
- 승인형 변경
  - 정책: `draft -> pending_owner_approval -> approved/rejected -> applied`
  - 모델: `draft_experiment -> training_running -> evaluation_ready -> pending_owner_approval -> approved/rejected -> deployed/rolled_back`
  - 재학습 job: `pending_owner_approval -> queued -> running -> completed|failed|cancelled`
- 감사 로그
  - 민감 액션(PII 열람, 차단, 승인/배포, 권한 변경) 기록

## API 엔드포인트

- `GET /v1/admin/me`
- `GET /v1/admin/overview`
- `GET /v1/admin/users`
- `GET /v1/admin/users/{target_user_id}/ban-context`
- `POST /v1/admin/restrictions`
- `GET /v1/admin/moderation/queues`
- `GET /v1/admin/support/queue`
- `GET /v1/admin/support/queue-summary`
- `POST /v1/admin/support/tickets/{ticket_id}/reply`
- `POST /v1/admin/policies`
- `PATCH /v1/admin/policies/{policy_change_id}`
- `GET /v1/admin/policies`
- `POST /v1/admin/policies/{policy_change_id}/apply`
- `POST /v1/admin/model-ops`
- `GET /v1/admin/model-ops`
- `POST /v1/admin/model-ops/{model_change_id}/transition`
- `POST /v1/admin/model-ops/{model_change_id}/retraining-jobs`
- `GET /v1/admin/model-ops/{model_change_id}/retraining-jobs`
- `POST /v1/admin/model-ops/retraining-jobs/{job_id}/transition`
- `POST /v1/admin/owner-approval`
- `GET /v1/admin/owner-approval`
- `POST /v1/admin/owner-approval/{approval_id}/decide`
- `POST /v1/admin/extensions/request`
- `GET /v1/admin/extensions`
- `POST /v1/admin/extensions/{extension_id}/decide`
- `GET /v1/admin/roles`
- `POST /v1/admin/roles/{target_user_id}`
- `GET /v1/admin/audit-log`

## 웹 라우트

- `/admin` : 운영 개요
- `/admin/users` : 사용자 목록 + 제재/차단 모달
- `/admin/moderation` : 신고/유해언어/안전 큐
- `/admin/support` : 문의/피드백 큐
- `/admin/policies` : 정책 draft/Owner 승인 요청/승인/적용
- `/admin/model-ops` : 모델 실험/승인 요청/승인/배포/롤백
- `/admin/roles` : 관리자 역할/확장 권한 요청·심사
- `/admin/audit-log` : 감사 로그

## 보안/권한 규칙

- `admin_role_not_assigned` 계정은 관리자 API 접근 불가(403)
- 첫 관리자 접근 계정은 bootstrap owner로 등록
- Support는 차단 실행 불가
- 정책 적용/모델 배포 및 롤백은 Owner만 가능
- 정책/모델 변경은 Owner 승인 전 반영 불가
- 재학습 job도 Owner 승인 전 `pending_owner_approval` 상태 유지
