이 폴더는 MindLab check-in 기능 blueprint다.
다음 순서로 구현하라.

1. `schemas/checkin_policy.yaml` 읽기
2. `data/checkin_question_catalog.csv` 기준으로 domain model 생성
3. `db/checkin_tables.csv` 기준으로 DB 스키마 구현
4. `api/openapi_checkin.yaml` 기준으로 endpoint 생성
5. raw -> derived feature ETL 구현
6. 7d / 28d rolling feature 생성
7. challenge recommendation과 current-state model이 읽을 수 있는 feature bundle 생성
