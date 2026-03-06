# Codex 시작 프롬프트 (마이페이지)

이 레포에는 `blueprint/mypage/`가 있다. 다음을 구현하라.

목표:
- 마이페이지를 '개인 허브'로 구현
- 첫 화면은 요약 카드와 빠른 진입만 제공
- 상세 기능은 하위 페이지로 분리

반드시 반영:
1. 활동로그는 마이페이지 하위 기능이다.
2. 회원정보 수정과 보안 설정을 분리한다.
3. 현재 비밀번호는 비밀번호 변경 시에만 필수다.
4. 리포트는 보관함 + 새 리포트 만들기 진입점 구조다.
5. 마케팅 동의는 현재 비활성 placeholder로만 남긴다.

라우트:
- /mypage
- /mypage/profile
- /mypage/security
- /mypage/activity-log
- /mypage/bookmarks
- /mypage/my-posts
- /mypage/my-comments
- /mypage/support-tickets
- /mypage/report-vault
- /mypage/consents

API:
- /v1/mypage/home
- /v1/mypage/profile (PATCH)
- /v1/mypage/security/password
- /v1/mypage/bookmarks
- /v1/mypage/my-posts
- /v1/mypage/my-comments
- /v1/mypage/support-tickets
- /v1/mypage/report-vault
- /v1/mypage/consents

연동:
- activity_log blueprint
- report_summary blueprint
- support_feedback blueprint
- board_feed blueprint
- auth_account blueprint
