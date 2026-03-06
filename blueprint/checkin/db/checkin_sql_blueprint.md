# SQL blueprint

## Raw
- daily_checkin
- daily_checkin_version

## Derived
- daily_checkin_features_daily (materialized view 또는 ETL 결과)

## Notes
- local timezone 기준 user-date unique
- update는 overwrite가 아니라 version append
- derived feature는 current-state model과 trend metric 계산에 사용
