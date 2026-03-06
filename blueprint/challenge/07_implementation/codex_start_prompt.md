이 폴더는 MindLab challenge 기능 blueprint다.
다음 순서로 구현하라.

1. `00_overview/challenge_policy.yaml` 읽기
2. `02_domain/challenge_data_dictionary.csv` 기준으로 DB 모델 생성
3. `03_backend/api_contract.yaml` 기준으로 API 스켈레톤 생성
4. `03_backend/events_schema.csv` 기준으로 analytics event 스키마 생성
5. `02_domain/recommendation_rules.yaml` 기준으로 rule-based recommender v1 생성
6. `04_frontend/*` 기준으로 프론트 화면 스켈레톤 생성
7. `06_modeling/feature_linkage.csv`에 나온 파생 feature가 저장될 수 있도록 ETL hook 추가
8. acceptance criteria 검증

주의:
- CBT 관련 기능을 challenge 모듈에 넣지 말 것
- 자유일기 기능을 challenge에 넣지 말 것
- risk_level >= 2 일 때 recommendation을 제한할 것
