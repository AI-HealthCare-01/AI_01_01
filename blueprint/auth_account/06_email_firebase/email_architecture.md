# Firebase 이메일 확인 / 재설정 구조

## v1 원칙
- 운영 이메일 발송은 Firebase Authentication 기본 메일 액션 사용
- 커스텀 SMTP / 별도 발송 서비스 / 도메인 발신 설계는 제외
- 필요하면 Firebase Console의 Email Templates 수준에서 문구/링크 설정만 조정

## 사용 시나리오
1. 회원가입 직후 이메일 확인 메일 발송
2. 로그인 시 이메일 미확인 상태면 재발송 유도
3. 비밀번호 찾기 시 재설정 메일 발송
4. 필요 시 continue URL로 앱/웹 특정 페이지로 복귀

## 커스텀 핸들러(선택)
- 기본 Firebase hosted handler 사용 가능
- UX 통합을 위해 custom email action handler를 별도 웹 페이지로 구현 가능
- 이 경우 링크 클릭 후:
  - verification success
  - reset password form
  - expired/invalid code 안내
  처리를 앱 스타일에 맞게 구성 가능
