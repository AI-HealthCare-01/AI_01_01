이 폴더는 MindLab CBT 기능 blueprint다.
다음 순서로 구현하라.

1. `02_domain/cbt_data_dictionary.csv` 기준으로 DB 모델 생성
2. `02_domain/cbt_state_schema.json` 기준으로 structured extractor 구현
3. `03_backend/api_contract.yaml` 기준으로 API 스켈레톤 생성
4. `06_safety/risk_policy.md` 기준으로 risk gate 구현
5. `05_modeling/cbt_to_model_linkage.csv`에 나온 export feature를 생성하는 ETL hook 구현
6. acceptance criteria 검증

주의:
- raw transcript 전체를 feature mart에 직접 넣지 말 것
- core belief hypothesis를 v1 현재 상태 모델의 핵심 feature로 쓰지 말 것
