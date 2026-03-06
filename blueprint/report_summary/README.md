# 요약 리포트(진료 보조용) Blueprint

- 목적: 사용자가 정신과/상담 방문 시, 말로 설명하기 어려운 부분을 **구조화된 요약 + 추세 그래프 + 최근 설문**으로 보조
- 기간 선택: 7일 / 28일 / 사용자 지정(최대 90일 권장)
- 내보내기: **PDF** 또는 **이미지(PNG/JPG)** 선택

> 주의: 본 리포트는 **진단/처방을 대체하지 않으며**, 자기기록/앱 로그 기반 참고자료입니다.

## 폴더 구성
- `00_overview/` : 리포트 섹션/원칙 요약
- `01_product/` : UX 플로우, 카피, 상태(loading/empty/error)
- `02_domain/` : 데이터 계약, 파생지표 정의, 결측 처리
- `03_backend/` : API 계약(OpenAPI 스니펫), 권한/감사로그
- `04_frontend/` : 컴포넌트 맵, 화면 레이아웃
- `05_export/` : PDF/이미지 생성 방식(권장 구현)
- `06_privacy_safety/` : 민감정보/위험 플래그 표시 규칙
- `07_implementation/` : 단계별 To-do, Acceptance criteria
- `codex_prompts/` : Codex 실행용 프롬프트

## 구현 우선순위(권장)
1) `02_domain/data_contracts.json` 확정
2) `02_domain/metrics_definitions.md` 구현
3) `03_backend/openapi_snippet.yaml` API 구현
4) `04_frontend/report_page_spec.md` 화면 구현
5) `05_export/export_spec.md` 내보내기(PDF/PNG) 구현
