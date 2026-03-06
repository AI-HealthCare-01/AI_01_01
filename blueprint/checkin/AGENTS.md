# Check-in Feature Working Rules v2

## Goal
Build a daily check-in that users can finish quickly and that supports:
- current state prediction
- dashboard trend metrics
- challenge recommendation
- sparse anchor calibration

## Scope boundaries
- include: sleep total, wake time, sleep latency, mood, anxiety/stress, energy, sunlight, exercise, alcohol, caffeine after 2 PM
- exclude: outing, free journal, CBT thought record, rumination, avoidance
- allow same-day raw check-in values to feed the current-state model
- keep v1 under 45 seconds
- store raw and derived separately

## Data / modeling rules
- one raw record per user per local date
- retain edit history
- derive wake regularity from recorded times; do not self-rate
- generate 7d and 28d windows with missing counts and days_since_prev_checkin
- keep compatibility with `daily_state`, `periodic_assessment`, and challenge feature mart
