# Change log v3

## 이번 수정
- target를 변화량 예측에서 현재 상태(nowcast) 예측 중심으로 재정렬
- challenge raw tables를 `catalog / exposure / enrollment / day_log` 구조로 통일
- check-in blueprint에서 제거된 변수(avoidance, social_connectedness 등)에 의존하던 추천 규칙 제거
- recommendation reason code를 modifiable gap 중심으로 재작성
- analytics에 post-launch retraining용 exposure / response / helpfulness 집계 요구 추가
