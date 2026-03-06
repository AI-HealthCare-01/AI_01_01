# ML Serving / Retraining Scaffold

## 현재 구현

### 1) 모델 서빙 API (`apps/api/app/modeling`)

- `GET /v1/modeling/runtime`
  - 모델 번들 경로/준비 여부, 의존성 준비 여부, feature 개수 확인
- `POST /v1/modeling/nowcast/predict`
  - `model/` 번들의 `model_feature_columns.json` + `*.joblib`를 로딩해
    `dep/anx/ins` nowcast 예측 반환
  - 누락 feature는 `model/data/train_user_day_nowcast.csv` 1행 기본값으로 보정
  - 예측 이력 저장은 `capture_for_retraining=true`(기본)
- `GET /v1/modeling/nowcast/history`
  - 사용자별 예측 이력 조회

저장 테이블:
- `model_nowcast_prediction`

### 2) 승인형 재학습 Job (`apps/api/app/admin_console`)

- `POST /v1/admin/model-ops/{model_change_id}/retraining-jobs`
- `GET /v1/admin/model-ops/{model_change_id}/retraining-jobs`
- `POST /v1/admin/model-ops/retraining-jobs/{job_id}/transition`

저장 테이블:
- `admin_model_retraining_job`

상태:
- `pending_owner_approval -> queued -> running -> completed|failed|cancelled`

Owner 승인 연동:
- 동일 `model_change`가 Owner 승인되면 해당 change에 매달린
  `pending_owner_approval` job을 자동 `queued`로 승격
- Owner 거절 시 `cancelled` 처리

재학습 대상 산정(현재 반영):
- 가입 후 28일 이상 사용자(`account_user.created_at`)
- 진단척도 2회 이상 완료 사용자(`periodic_assessment.status in completed/late`)
- 위 조건을 만족한 사용자는 이후 재학습 대상 풀에 계속 포함
- 운영자가 설정한 진단 완료일 수집 기간(`start_date ~ end_date`) 안에서 스크리닝

학습 행(row) 기준:
- 종속변수: 진단 완료 시점의 `phq9_total / gad7_total / isi_total`
- 독립변수: 해당 진단일 기준 직전 28일 입력(체크인/활동 파생 포함)
- 기본적으로 2회차 진단부터 학습 행으로 포함
- 재학습 요청 시 데이터 스냅샷 ID는 서버에서 자동 생성

운영자 결과 설명:
- 재학습 완료 시 `metrics_before / metrics_after / score_comparison` 저장
- 지표별 개선/저하와 함께 비전문가용 한줄 설명(`operator_summary`) 자동 생성
- 완료 처리 시 수동 지표가 없으면 시스템이 자동 기준값을 사용하고 사유를 설명에 표시
- 재학습 완료 시 신규 개설 챌린지 추천(`program_recommendations`)과
  운영 개선 제안(`improvement_recommendations`)을 함께 생성
- 추천의 근거(비교행 수, 예상 지표 변화, 설명 문구)를 `result_summary`에 저장
- 관리자 콘솔에서 체크박스 옵션 설명과 대상 사용자/행 수 요약 확인 가능

## 환경변수

- `MODEL_BUNDLE_DIR` (기본: `<repo>/model`)

## 현재 한계

- 실제 재학습 실행 워커/배치(ECS Batch, Step Functions, Airflow 등)는 미연결
- 온라인 feature ETL(사용자 raw log -> model feature 97개 완전 자동 생성)은 미완성
- 모델 버전별 A/B 트래픽 라우팅 및 shadow serving은 미구현

## 다음 단계 (권장 순서)

1. 데이터 파이프라인 고정 (D+2)
   - `daily_state_final`, `7d/28d trend`, `days_since_last_assessment` 산출 ETL 확정
2. 재학습 실행기 연결 (D+4)
   - `admin_model_retraining_job`의 `queued`를 실제 학습 잡으로 소비
3. 배포 게이트 확장 (D+5)
   - 오프라인 메트릭 기준 + 캘리브레이션 기준 미달 시 배포 차단
4. 운영 모니터링 (D+7)
   - drift/결측/latency 모니터링 + 알림 규칙 추가
