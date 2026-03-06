# AGENTS.md - CBT Blueprint

이 폴더는 MindLab CBT 기능 blueprint다. Codex는 먼저 다음 파일을 읽는다.

1. `00_overview/feature_summary.md`
2. `02_domain/cbt_data_dictionary.csv`
3. `02_domain/cbt_export_contracts.csv`
4. `06_safety/risk_policy.md`
5. `05_modeling/cbt_to_model_linkage.csv`
6. `07_implementation/acceptance_criteria.md`

## 구현 규칙
- CBT raw conversation 전문을 모델 feature mart에 직접 넣지 말 것
- 모델 입력으로 export하는 것은 `cbt_session_summary`와 `cbt_risk_signal`만 우선 사용
- core belief hypothesis는 사용자-facing 확정 문구로 노출하지 말 것
- risk_level >= 2 이면 일반 개입보다 safety flow를 우선
- wellness copy를 유지하고 진단/치료 단정 문구를 피할 것
