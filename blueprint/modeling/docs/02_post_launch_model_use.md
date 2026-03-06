# Post-launch model use

## 출시 초기
- synthetic 기반 모델 유지
- real data는 수집 및 품질 점검 위주
- calibration 먼저 수행

## 데이터가 쌓인 뒤
1. calibration update
2. hybrid retraining (real + synthetic)
3. real-data-first retraining

## 항상 다시 계산할 것
- daily_state_final
- 7d / 28d trend metrics
- days_since_last_assessment / overdue

## 쉽게 바꾸지 말 것
- safety gate
- high-risk routing
