# ID 규칙

## 1. 서비스 내부 ID
- 필드: `user_id`
- 예시: `usr_01JQX4M9Y1N8A3K7T5R2Z6C4V0`
- 목적:
  - 서비스 전반의 기본 내부 식별자
  - 게시판, 문의, 활동 로그, 관리자 조회

## 2. Firebase 인증 ID
- 필드: `firebase_uid`
- 목적:
  - Firebase Authentication 계정 매핑
- 주의:
  - 직접 외부 노출하지 않음
  - 서비스 PK로 단독 사용하지 않음

## 3. 모델 데이터셋 ID
- 필드: `ml_subject_id`
- 예시: `real_ml_2026_00000123`
- 목적:
  - 모델 학습/평가/feature mart
  - synthetic 데이터와 시각적으로 구분
- 규칙:
  - `real_ml_YYYY_serial8`
  - synthetic 예: `syn_u_000001`
  - real과 synthetic가 사람 눈으로 즉시 구분되도록 prefix를 다르게 유지

## 4. 매핑
- `user_id` <-> `firebase_uid`
- `user_id` <-> `ml_subject_id`
- 매핑 테이블은 별도 관리
