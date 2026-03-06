Read:
- blueprint/checkin/README.md
- blueprint/checkin/docs/02_user_flows.md
- blueprint/checkin/data/checkin_question_catalog.csv

Task:
Add tests and seed data.

Requirements:
- test first-time submit
- test same-day edit
- test skip flow
- test invalid enum payload
- test invalid wake time format
- test duplicate same-day active record handling
- add seed data for at least:
  - complete record
  - skipped record
  - edited record
  - partially complete draft if supported
