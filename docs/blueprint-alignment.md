# Blueprint Alignment Checklist

기준:
- `blueprint/*/AGENTS.md`
- `blueprint/*/README.md`
- 현재 `apps/web`, `apps/api`, 테스트 코드

## 1) 인증/계정/온보딩 (`auth_account`)

- [x] 회원가입(닉네임/이메일/비밀번호/필수동의)
- [x] 이메일 인증 전 주요 기능 접근 제한
- [x] 비밀번호 재설정
- [x] 온보딩(동의/출생년도/성별)
- [x] 초기 진단척도 완료 후 baseline 반영
- [x] `user_id` / `firebase_uid` / `ml_subject_id` 분리

## 2) 코어 입력 (`checkin`, `assessment_scales`, `challenge`, `journal`, `activity_log`)

- [x] 체크인 작성/수정 + feature bundle
- [x] 진단척도 start/answer/complete/history
- [x] 챌린지 추천/등록/day-log
- [x] 일기 CRUD(목록/상세/수정/삭제)
- [x] 활동로그 day 요약 뷰 + 원천 로그 분리

## 3) CBT/대시보드/리포트 (`cbt`, `dashboard`, `report_summary`)

- [x] CBT 대화형 메시지 스레드
- [x] LLM 구조화 출력 + fallback 경로
- [x] JSON schema 검증 + `cbt_session_summary`/`cbt_risk_signal` 분리 저장
- [x] 상태 대시보드(7d/4w, 우울·불안·불면 세로 배치)
- [x] 활동 대시보드(요약 카드 + 캘린더)
- [x] 요약 리포트 preview/export(PDF/PNG), 헤더 PII 최소화
- [ ] 위기 대응 외부 리소스 라우팅 고도화(국가/지역별)

## 4) 커뮤니티/문의/마이페이지 (`board_feed`, `support_feedback`, `mypage`)

- [x] 피드/공지/북마크 탭 + 검색 + 더보기
- [x] 신고/유해언어/안전 큐 분리
- [x] 문의 티켓/재오픈/알림 흐름
- [x] 마이페이지 허브 + 하위 기능 라우트
- [x] 활동로그/북마크/내 글/내 댓글/내 문의/리포트 보관함

## 5) 관리자 콘솔 (`admin_console`)

- [x] Owner/Admin/Support 권한 모델
- [x] 사용자 목록 기본 화면 IP 비노출
- [x] 차단 컨텍스트에서만 이메일/IP 상세
- [x] 계정차단/IP차단 복수 선택
- [x] 정책/모델 변경 Owner 승인 플로우
- [x] 감사 로그
- [x] support/moderation/safety/ops/ml 큐 분리

## 6) 모델 연결 (`modeling`)

- [x] 모델 런타임 상태 확인
- [x] nowcast 예측/히스토리 API
- [x] 관리자 retraining job(승인형 상태 전이)

## 7) UI/디자인 시스템 (공통)

- [x] 토큰 기반 스타일 체계
- [x] 공통 UI 컴포넌트
- [x] 모바일 우선 대응
- [x] 글로벌 메뉴(어느 화면에서든 핵심 기능 이동)
- [x] 레퍼런스 기반 파스텔 톤/라운드/얕은 그림자/넓은 여백 강화

## 남은 우선 TODO

1. CBT 위기 대응 외부 연계 리소스(지역/국가 단위) 구체화
2. 관리자/운영 화면 E2E(실브라우저 + 권한 시나리오) 자동화
3. 디자인 회귀 방지(visual regression) 파이프라인 추가
