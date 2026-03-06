다음 파일을 기준으로 modeling scaffolding을 구현하라.
- data/table_dictionary.csv
- data/train_mart_spec.csv
- docs/03_synthetic_generation_spec.md
- docs/04_retraining_policy.md

구현 요구:
- raw -> state -> trend -> train mart ETL
- current-state model 3개(dep/anx/ins) 학습
- metrics와 manifest 저장
- inference script 생성
