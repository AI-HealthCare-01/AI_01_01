# 보안 규칙

## 인증/로그인
- 로그인 실패 rate limit
- 이메일 확인 재발송 rate limit
- 비밀번호 재설정 요청 rate limit
- 브루트포스 방지

## 재인증 필요 작업
- 이메일 변경
- 비밀번호 변경
- 계정 삭제
- 민감 정보 일부 변경(정책에 따라)

## 세션
- Firebase ID token 검증 필수
- 서비스 세션은 짧은 TTL + refresh 전략 권장
- 관리자 권한은 custom claims 또는 별도 RBAC 테이블과 연동 가능

## 감사 로그
- signup
- email_verification_sent
- email_verified
- password_reset_sent
- login_success/failure
- onboarding_completed
