# Core Inputs (Check-in / Assessments / Challenge / Journal / Activity Log)

## 구현 범위

- `checkin`: 일일 구조화 입력 저장/수정, 파생 feature(7d/28d 결측 포함) 계산
- `assessment_scales`: PHQ-9 / GAD-7 / ISI 세션 시작/응답/완료/이력
- `challenge`: 카탈로그/추천/노출로그/참여/일별 수행 로그
- `journal`: 상위 메뉴 CRUD (목록/상세/수정/삭제)
- `activity_log`: 마이페이지 하위 day summary 조회 (리스트/캘린더)

## 핵심 원칙 반영

- 일기 본문 전체는 `일기 상세`에서만 노출
- 활동로그는 요약(`preview_text`, count)만 노출하고 원 기능 라우트로 이동
- 사용자용 day 요약 뷰와 모델링용 원천 로그 테이블 분리
  - 사용자 뷰: `user_day_activity_log`, `user_day_activity_log_item`
  - 원천 로그: `daily_checkin*`, `periodic_assessment*`, `challenge_*`, `journal_entry` 등

## 웹 라우트

- `/checkin`
- `/assessments`
- `/challenge`
- `/journal`
- `/journal/new`
- `/journal/[entryId]`
- `/journal/[entryId]/edit`
- `/mypage/activity-log`

## API 엔드포인트

### Check-in
- `GET /checkin/today`
- `POST /checkin/today`
- `POST /checkin/today/edit`
- `GET /checkin/features/today`

체크인 입력(모델 입력 raw):
- 총 수면시간
- 기상시간
- 잠들기까지 걸린 시간
- 기분(1-5)
- 불안/스트레스(1-5)
- 에너지(1-5)
- 햇빛 노출
- 운동
- 음주
- 오후 2시 이후 카페인 여부

### Assessment
- `POST /v1/assessments/start`
- `POST /v1/assessments/{assessment_id}/answer`
- `POST /v1/assessments/{assessment_id}/complete`
- `GET /v1/assessments/history`

### Challenge
- `GET /challenge/catalog`
- `GET /challenge/recommendations/today`
- `POST /challenge/exposures`
- `POST /challenge/enrollments`
- `PATCH /challenge/enrollments/{enrollment_id}`
- `POST /challenge/day-log`

### Journal
- `GET /v1/journal`
- `POST /v1/journal`
- `GET /v1/journal/{journal_id}`
- `PATCH /v1/journal/{journal_id}`
- `DELETE /v1/journal/{journal_id}`

### Activity Log
- `GET /v1/mypage/activity-log`

## 권한/접근

- 모든 core input API는 인증 필요
- 이메일 미인증 사용자는 core input API 접근 불가 (`email_verification_required`)
- 웹 화면은 `AuthRouteGuard(policy="require-active")` 적용
