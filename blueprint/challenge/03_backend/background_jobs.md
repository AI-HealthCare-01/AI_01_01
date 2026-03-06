# Background jobs

1. Daily recommendation job
- input: current state, recent check-in windows, challenge history, risk summary
- output: challenge_exposure candidates

2. Active slot reconciler
- enforce max 3 sustained enrollments
- expire outdated enrollment

3. Challenge feature mart updater
- aggregate 7d / 28d completion, helpfulness, dropout
