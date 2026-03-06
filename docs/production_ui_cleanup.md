# Production UI Cleanup (Dev/Preview Text Removal)

기준:
- `AGENTS.md`
- `docs/current_vs_blueprint_gap.md`
- `docs/screen_inventory.md`

목적:
- production 사용자 화면에서 개발자용 문구/프리뷰 블록 제거
- 내부 점검용 프리뷰는 internal route로 분리

## 제거/이동 내역

| 구분 | route | before | after |
|---|---|---|---|
| remove | `/` | 채팅 preview 블록(`ms-home-chat-preview`) | 실제 기능 안내 카드(`오늘의 CBT 시작 가이드`)로 교체 |
| remove | `/cbt` | `planner action`, `session_id` 등 기술 표기 | 사용자 안내 문구로 치환 |
| remove | `/report/summary` | 섹션 제목 `0.`, `1.` 등 구현자 중심 표기 | 사용자 중심 섹션명으로 정리 |
| remove | `/mypage/consents` | `마케팅 동의(placeholder)` | `마케팅 안내 수신`으로 변경 |
| copy cleanup | `/checkin` | `core 입력`, `raw 테이블` 등 구현 설명 | 사용자 목적 중심 설명으로 변경 |
| copy cleanup | `/assessments` | `structured`, `raw 테이블`, `assessment_id` 노출 | 사용자 점검 흐름 중심 설명으로 변경 |
| copy cleanup | `/mypage/activity-log` | `day 요약 뷰`, `day summary` 등 기술 톤 | 날짜별 활동 확인/상세 이동 중심 문구로 변경 |
| copy cleanup | `/mypage/report-vault` | `메타데이터`, `기능 진입` 등 개발 톤 | 사용자 행동 중심 문구로 변경 |
| copy cleanup | `/journal` | `day 요약` 중심 설명 | 활동로그 확인 중심 문구로 변경 |
| move | `/design-system` | 공개 route에서 내부 프리뷰 노출 | `/internal/design-system`으로 이동(운영 메뉴 비노출) |

## route별 반영 요약

- 사용자 공개 화면: `/` 에서 프리뷰형 데모 블록 제거 완료
- 로그인 후 사용자 화면:
  - `/checkin`, `/assessments`, `/cbt`, `/report/summary` 개발자 설명 문구 제거/완화
- 마이페이지:
  - `/mypage`, `/mypage/activity-log`, `/mypage/report-vault`, `/mypage/consents` 문구 정리
- 게시판:
  - `/board-feed` 상단 설명을 운영 사용자 문구로 정리
- 대시보드:
  - `/dashboard/state`, `/dashboard/activity` 설명 문구를 사용자 중심으로 정리
- 일기:
  - `/journal` empty-state 설명 문구 정리
- 온보딩:
  - 기존 운영 문구 유지(개발자 프리뷰 문구 없음 확인)

## 참고

- 내부 프리뷰는 `/internal/design-system`으로 유지
- 운영 사용자 메뉴(`AppShell`)에는 내부 프리뷰 링크를 추가하지 않음
