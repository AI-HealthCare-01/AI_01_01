# 문의/피드백 기능 Blueprint

목표:
- 사용자가 앱 내에서 **문의(inquiry)** 또는 **피드백(feedback)** 을 비공개로 작성
- 관리자는 관리자페이지에서 **처리 필요 알림**으로 확인
- 관리자가 답변하면 사용자는 **마이페이지 알림**으로 확인
- 사용자가 답변이 충분하지 않다고 느끼면 **같은 티켓 안에서 추가문의** 가능
- 추가문의가 발생하면 해당 티켓은 다시 **관리자 답변 대기 큐**로 복귀

핵심 원칙:
- 문의와 피드백은 화면상 구분될 수 있지만, 내부적으로는 **하나의 티켓 시스템**으로 통합
- 문의/피드백은 **공개 게시판이 아닌 비공개 채널**
- 알림 목록과 전체 내역 목록은 분리
- 관리자페이지/마이페이지는 나중에 별도 설계하더라도, 이 문서의 상태값/알림 규칙을 그대로 연동 가능하게 설계

## 폴더 구성
- `00_overview/` : 전체 설계 원칙, 상태 흐름, 핵심 결정
- `01_product/` : 사용자 플로우, 폼 규칙, UX 카피
- `02_domain/` : 티켓/메시지/상태/우선순위/알림 도메인 규칙
- `03_storage/` : DB 스키마, 상태 이력, 첨부, 알림 저장
- `04_backend/` : API 계약(OpenAPI snippet)
- `05_frontend/` : 사용자 화면 구조
- `06_admin_integration/` : 관리자페이지 연동 요구사항
- `07_mypage_integration/` : 사용자 마이페이지 알림/내역 연동 요구사항
- `08_ops_safety/` : 민감/긴급 문의 분리, SLA, 우선순위
- `codex_prompts/` : Codex용 시작 프롬프트

## 구현 우선순위(권장)
1) `02_domain/data_contracts.json`
2) `03_storage/schema.sql`
3) `04_backend/openapi_snippet.yaml`
4) `05_frontend/screens.md`
5) `06_admin_integration/admin_queue_rules.md`
6) `07_mypage_integration/mypage_notification_rules.md`
