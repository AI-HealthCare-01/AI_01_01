Synthetic CBT nowcast dataset (proxy + imputation + filter) - 5000 rows total

Row counts:
{'users': 110, 'baseline_assessment': 110, 'daily_checkin': 1320, 'sleep_log': 880, 'activity_log': 660, 'cbt_session': 200, 'challenge': 30, 'challenge_day': 150, 'daily_state': 1320, 'weekly_outcome': 220}

Notes:
- daily_state includes: proxy scores, anchor (occasional), proxy_hat (simulated nowcast predictions),
  measurement selection, EMA and 1D Kalman filter state estimates, and latent_true (synthetic ground truth).
- For modeling, treat *_proxy_0_100 as the target of the imputation model, and use daily_state.*_latent_true_0_100
  only for evaluation (not available in real data).
