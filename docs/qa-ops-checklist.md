# Review / QA / Ops Checklist

## 목표

민감정보/권한/모델/알림/결측/운영 로그 영역을 릴리즈 전에 반복 점검하기 위한 체크리스트.

## 즉시 실행 가능한 자동 점검

1. 정적/단위/통합
- `make lint`
- `make test`
- `make smoke`

2. 모델 번들 연결 점검
- `GET /v1/modeling/runtime`가 아래 조건을 만족하는지 확인
  - `bundle_ready=true`
  - `dependencies_ready=true`
  - `feature_count > 0`

3. 권한/승인 플로우
- Owner/Admin/Support 권한 경계 테스트(`apps/api/tests/test_admin_console_flow.py`)
- model change 승인 전/후 재학습 job 상태 전이 테스트(`apps/api/tests/test_modeling_flow.py`)

4. 화면 골격 스모크
- 핵심 라우트/디자인 시스템 파일 존재 점검(`apps/web/tests/smoke.test.mjs`)

## 수동 점검(배포 전 필수)

1. 민감정보 노출
- 일반 사용자 화면에서 IP 미노출
- 활동로그에 자유텍스트 원문 과다 노출 없는지 확인

2. 접근 제어
- 이메일 미인증 사용자 주요 기능 차단
- 관리자 API의 역할별 403 동작 확인

3. 운영 로그
- 감사로그에 민감 본문 저장되지 않는지 샘플 확인
- `action_type/target_type/target_id` 누락 여부 확인

4. 모델 출력 안전
- 예측 응답에 원문 텍스트 포함되지 않는지 확인
- 위험 신호가 구조화 필드로만 노출되는지 확인

## 지금 당장 어려운 항목과 선행조건

1. 실재학습 자동화
- 필요: 실행 인프라(ECS Batch/Step Functions 등), 학습 컨테이너, 아티팩트 레지스트리
- 권장 시점: staging 인프라 확정 직후 (이번 스프린트 +1)

2. 운영 품질 경보 자동화
- 필요: 지표 수집 파이프라인(latency, drift, 결측률), 알림 채널(Slack/PagerDuty)
- 권장 시점: 모델 서빙 트래픽이 실제 유입되기 전 (이번 스프린트 +1)

3. E2E 브라우저 테스트
- 필요: 안정된 seed 데이터/테스트 계정 및 CI 브라우저 러너
- 권장 시점: 핵심 화면 기능 로직이 고정되는 시점 (이번 스프린트 +2)
