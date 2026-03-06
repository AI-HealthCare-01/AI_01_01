# Codex 시작 프롬프트 (인증/온보딩)

이 레포의 `blueprint/auth_account/`를 기준으로 다음을 구현하라.

목표:
- Firebase Authentication 기반 이메일/비밀번호 회원가입/로그인
- 이메일 확인 메일 및 비밀번호 재설정 메일 사용
- 서비스 내부 user_id / ml_subject_id 분리 저장
- 이메일 확인 후 첫 로그인 시 온보딩 강제
- 온보딩에서 출생년도 + 민감정보 동의 + 초기 진단척도 연결

제약:
1. 이메일 확인은 '이메일 소유 확인'으로만 표현한다.
2. 가입 폼은 최소 입력만 받는다: nickname, email, password, password_confirm, required consents.
3. birth_year와 gender는 온보딩에서만 수집한다.
4. Firebase UID를 서비스 기본 키로 직접 사용하지 않는다.
5. baseline assessment 완료 전 홈 진입을 허용하지 않는다.

구현 범위:
- 프론트:
  - SignupScreen
  - VerifyEmailPendingScreen
  - LoginScreen
  - ForgotPasswordScreen
  - OnboardingProfileScreen
  - OnboardingGate
- 백엔드:
  - Firebase ID token verification
  - user_id / ml_subject_id provisioning
  - account status / onboarding status endpoints
- 저장:
  - schema.sql 반영

제출:
- 구현 코드
- 환경변수 예시
- 실행 방법 README 업데이트
