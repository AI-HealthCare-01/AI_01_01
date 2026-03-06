# Modeling and feature engineering

## 현재 상태 모델
타깃:
- dep_state_today
- anx_state_today
- ins_state_today

same-day check-in raw value는 타깃과 같은 날의 관측치이므로 사용할 수 있다.
다만 raw와 derived를 분리 저장해야 한다.

## 파생 feature
- sleep_total_mean_7d / 28d
- wake_time_std_7d / 28d
- mood_mean_7d / 28d
- anxiety_mean_7d / 28d
- energy_mean_7d / 28d
- daylight_days_ge_10m_7d / 28d
- exercise_days_ge_10m_7d / 28d
- alcohol_days_7d / 28d
- late_caffeine_days_7d / 28d
- checkin_missing_cnt_7d / 28d
- days_since_prev_checkin

## periodic assessment와의 연결
- last PHQ-9 / GAD-7 / ISI score
- days_since_last_assessment
- overdue flag
