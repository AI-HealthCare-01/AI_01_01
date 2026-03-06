# Firebase Authentication 연동 포인트

## 클라이언트
- Email/Password provider 사용
- 회원가입:
  - createUserWithEmailAndPassword
- 이메일 확인:
  - sendEmailVerification
- 비밀번호 재설정:
  - sendPasswordResetEmail
- 로그인:
  - signInWithEmailAndPassword

## 서버
- Firebase ID token 검증
- firebase_uid -> user_id 매핑
- 계정 상태 / 온보딩 상태 반환
- 필요한 경우 custom claims로 역할 부여(관리자 페이지와 연계 가능)

## 이메일 액션
- 기본 Firebase action handler 사용 가능
- 필요 시 custom email action handler 페이지를 만들어 앱/웹 특정 페이지로 복귀
- continue URL 사용 가능
