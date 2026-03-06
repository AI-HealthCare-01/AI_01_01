# 진단척도 검사(우울/불안/수면) Blueprint

목표:
- 우울/불안/불면 관련 **표준화 설문**을 앱에서 수행하고,
- 결과를 **추세/요약리포트/모델(현재상태 nowcast) 보정 앵커**로 활용한다.
- 권장 주기: 28일(4주) 1회. 단, 사용자는 불규칙하게 수행할 수 있다.

중요 원칙(타당성):
- PHQ-9 / GAD-7 / ISI는 **검증된 문항·응답척도**가 핵심이다.
- 따라서 문항/응답 기준을 임의로 재작성하지 않는다.
- 대신, 섹션 이름/안내문/결과 설명/버튼 UI를 부드럽게 설계한다.

> 본 기능은 진단/치료를 대체하지 않는 **자기점검 및 추세 확인(보조) 용도**이다.

## 폴더 구성
- `00_overview/` : 설계 원칙, UX 톤, 근거 링크
- `01_product/` : 사용자 플로우, 카피, 섹션 이름
- `02_domain/` : 데이터 계약(JSON Schema), 점수/밴드 규칙, 주기/스케줄 규칙
- `03_storage/` : DB 스키마(테이블/컬럼), 이벤트 로그
- `04_backend/` : API 계약(OpenAPI snippet), 권한/감사로그
- `05_frontend/` : 화면/컴포넌트/상태(loading/empty/error)
- `06_results/` : 시각화/설명 템플릿(비진단형)
- `07_safety/` : PHQ-9 위험 문항 대응(조건부 안내)
- `codex_prompts/` : Codex 구현 프롬프트

## 구현 순서(권장)
1) `02_domain/data_contracts.json` 확정
2) `03_storage/schema.sql` 반영
3) `04_backend/openapi_snippet.yaml` API 구현
4) `05_frontend/screens.md` UI 구현
5) `06_results/` 결과 화면 + 추세 그래프
6) `07_safety/` 조건부 안전 안내 연결
