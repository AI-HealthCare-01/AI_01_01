Read:
- blueprint/checkin/data/checkin_event_taxonomy.csv
- blueprint/checkin/data/checkin_success_metrics.csv
- blueprint/checkin/docs/05_metrics_and_experimentation.md

Task:
Implement analytics logging and metric hooks for the check-in feature.

Requirements:
- event instrumentation for prompt, start, answer, submit, skip, edit, reminder
- track completion time
- support question-level drop-off analysis
- add dashboards or query stubs for core metrics
- log client and server validation failures separately
