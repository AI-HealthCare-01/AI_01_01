# 마이페이지 Blueprint

버전: v1.0  
작성일: 2026-03-02

목표:
- 마이페이지를 **개인 허브**로 설계한다.
- 첫 화면은 요약 + 바로가기 중심으로 두고, 실제 기능은 하위 상세 화면으로 분리한다.
- 기존 설계와 연결:
  - 활동로그(`activity_log`)
  - 일기(`journal`)
  - 문의/피드백(`support_feedback`)
  - 요약리포트(`report_summary`)
  - 게시판(`board_feed`)
  - 인증/계정(`auth_account`)

핵심 원칙:
1. 회원정보 수정과 보안 설정은 분리한다.
2. 현재 비밀번호는 **비밀번호 변경 시에만 필수**다.
3. 활동로그는 마이페이지 하위 기능으로 둔다.
4. 리포트는 마이페이지에서 **보관/바로가기** 중심으로 다룬다.
5. 최근 활동 요약은 첫 화면에 짧은 카드로만 둔다.
6. 마케팅 동의는 현재 사용하지 않되, 나중에 추가할 수 있게 placeholder 구조만 남긴다.

## 폴더 구성
- `00_overview/` : 설계 원칙, IA, 결정사항
- `01_product/` : 사용자 플로우, 화면 구성, 카피 원칙
- `02_domain/` : 데이터 계약, 상태/카운트 정의
- `03_storage/` : DB/인덱스/감사로그 구조
- `04_backend/` : API 스니펫
- `05_frontend/` : 라우트/컴포넌트/상태 정의
- `06_integrations/` : 활동로그, 리포트, 문의, 게시판, 인증 연동 규칙
- `07_privacy_consents/` : 동의/민감정보/마케팅 placeholder
- `08_security/` : 비밀번호 변경, 재인증, 탈퇴
- `09_implementation/` : 단계별 구현 체크리스트
- `codex_prompts/` : Codex 시작 프롬프트

## 권장 라우트
- `/mypage`
- `/mypage/profile`
- `/mypage/security`
- `/mypage/activity-log`
- `/mypage/bookmarks`
- `/mypage/my-posts`
- `/mypage/my-comments`
- `/mypage/support-tickets`
- `/mypage/report-vault`
- `/mypage/consents`
