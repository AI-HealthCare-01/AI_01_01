# Codex 작업 규칙 (인증 / 계정)

- 이 blueprint는 이메일 발송을 **Firebase Authentication** 기준으로 설계한다.
- 커스텀 SMTP / Resend 운영 메일 발송은 v1 범위에서 제외한다.
- 이메일 확인은 '이메일 소유 확인' 용도다. '법적 본인인증'으로 표기하지 않는다.
- 가입 단계에서 받는 정보는 최소화한다:
  - nickname
  - email
  - password
  - password_confirm
  - required consents
- 출생년도 / 성별 / 민감정보 동의 / 초기 진단척도는 **온보딩**에서 수집한다.
- `user_id`와 `ml_subject_id`는 반드시 분리한다.
- Firebase UID를 서비스 내부 기본 키로 직접 사용하지 않는다. 별도 `user_id`를 둔다.
- 민감정보 관련 데이터는 계정 생성 직후가 아니라, 이메일 확인 후 온보딩에서 동의를 받은 뒤 저장한다.
- 보안 민감 기능(이메일 변경, 비밀번호 변경, 계정 삭제)은 최근 재인증이 필요하도록 설계한다.
- 결과적으로 계정 흐름은 다음 순서를 지킨다:
  1) signup
  2) email verification
  3) first login
  4) onboarding consent/profile
  5) baseline assessment
  6) dashboard/model bootstrap
