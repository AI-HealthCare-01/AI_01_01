# Architecture overview

## 제품 목적
- 모델의 예측 outcome은 현재 상태(nowcast)다.
- 대시보드 변화 추적은 최근 7일 / 최근 28일 회고 지표로 계산한다.
- 진단척도는 28일 권장이지만 불규칙하게 들어올 수 있는 sparse anchor다.

## 핵심 데이터 흐름
raw logs -> daily_state -> user_day_trend_metrics -> train_user_day_nowcast -> models

## 타깃
- dep_target_state_today
- anx_target_state_today
- ins_target_state_today

## trend metrics
- dep/anx/ins week_delta_retro
- dep/anx/ins month_delta_retro
