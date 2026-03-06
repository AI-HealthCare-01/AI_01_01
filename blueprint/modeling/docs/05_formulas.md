# Formulas

## trend metrics
week_delta_retro(t) = mean(state[t-6:t]) - mean(state[t-13:t-7])
month_delta_retro(t) = mean(state[t-27:t]) - mean(state[t-55:t-28])

## sparse anchor features
days_since_last_phq9 = t - last_completed_phq9_date
assessment_overdue_flag = 1 if scheduled assessment is late beyond configured threshold
