train_user_day_nowcast bundle

- rows: 1320
- columns: 206

Targets:
- dep_target_proxy_0_100, anx_target_proxy_0_100, ins_target_proxy_0_100
- *_target_observed_flag indicates label availability.

Leakage-safe design:
- same-day daily_checkin values are NOT included (only lag/rolling).
- same-day sleep core components are NOT included (only lag/rolling), to avoid leaking ins_proxy.
