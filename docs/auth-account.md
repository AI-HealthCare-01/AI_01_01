# Auth / Account / Onboarding

## 구현 범위

- Firebase Auth(email/password) 기반 회원가입/로그인
- 이메일 확인 전 주요 기능 접근 제한
- 비밀번호 재설정 메일 발송
- 첫 로그인 후 온보딩 강제
  - 민감정보 동의(필수)
  - 개인화/모델개선 동의(선택)
  - 출생년도(YYYY) 수집 및 파생 나이 저장
  - 성별(선택)
  - 초기 진단척도 1회 완료

## 웹 라우트

- `/auth/signup`
- `/auth/login`
- `/auth/verify-email`
- `/auth/reset-password`
- `/onboarding`
- `/onboarding/assessment`

주요 기능 페이지(`home`, `dashboard`, `board-feed`, `journal`, `mypage`, `admin`)는
`AuthRouteGuard`로 `require-active` 정책을 적용한다.

## API 엔드포인트

- `POST /v1/auth/signup`
- `POST /v1/auth/session/bootstrap`
- `POST /v1/onboarding/profile`
- `POST /v1/onboarding/baseline-assessment/complete`
- `POST /v1/assessments/start` (`source=onboarding`)
- `POST /v1/assessments/{assessment_id}/answer`
- `POST /v1/assessments/{assessment_id}/complete`

`/v1/onboarding/baseline-assessment/complete`는 점수 수동 입력을 받지 않는다.
완료된 온보딩 설문 세션의 `assessment_id`만 받아 baseline을 확정한다.

## ID 규칙

- `user_id`: `usr_<uuid>`
- `firebase_uid`: Firebase Authentication UID
- `ml_subject_id`: `real_ml_YYYY_serial8`

## 상태 전이

1. Signup: `pending_email_verification` / `not_started`
2. Email verified + first login: `active_onboarding_required` / `profile_pending`
3. Onboarding profile+consent saved: `active_onboarding_required` / `baseline_pending`
4. 온보딩 설문 완료 + baseline 확정: `active` / `complete`

## 로컬 Firebase Emulator

- Web: `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`
- API: `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`
- Local fallback header auth: `AUTH_ALLOW_EMULATOR_UID_FALLBACK=true`
- 실제 이메일 발송 테스트: `USE_FIREBASE_AUTH_EMULATOR=false` 로 웹/API를 실행해 Emulator 연결을 비활성화한다.

## Firebase 메일 템플릿 권장 설정

Firebase 기본 메일(이메일 인증/비밀번호 재설정)의 제목/본문/서명은
코드가 아니라 Firebase Console 템플릿에서 관리한다.

1. Firebase Console → Authentication → Templates
2. `Email address verification`, `Password reset` 템플릿 각각 수정
3. 발신자 이름(Display name): `midnight`
4. 제목/본문: 한글 문구로 변경
5. 본문 링크는 `%LINK%`를 버튼(`<a>`)에만 연결하고, 텍스트 URL 노출은 제거
6. Action URL/continue URL은 `NEXT_PUBLIC_AUTH_CONTINUE_BASE_URL` 기반 경로와 일치시킨다.
