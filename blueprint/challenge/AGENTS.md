# AGENTS.md - Challenge Blueprint v3

이 폴더는 구현용 blueprint다. Codex는 먼저 다음 파일을 읽는다.

1. `00_overview/challenge_policy.yaml`
2. `02_domain/challenge_data_dictionary.csv`
3. `02_domain/state_to_challenge_mapping.csv`
4. `02_domain/recommendation_rules.yaml`
5. `06_modeling/feature_linkage.csv`
6. `07_implementation/acceptance_criteria.md`

## 반드시 지켜야 할 규칙
- challenge 기능은 CBT 세션 내용에 직접 의존하지 말 것
- 자유일기 기능을 challenge 카탈로그에 추가하지 말 것
- 지속형 challenge는 동시에 최대 3개까지만 활성화
- 같은 도메인의 지속형 challenge를 2개 이상 동시에 활성화하지 말 것
- risk_level >= 2 이면 일반 recommendation을 축소 또는 억제
- feature importance를 인과 효과로 설명하는 copy를 만들지 말 것
- 추천 로그에는 `shown`, `accepted`, `declined`, `ignored`를 구분해서 남길 것
- 추천받지 않은 challenge와 추천받았지만 수락하지 않은 challenge를 혼동하지 말 것
