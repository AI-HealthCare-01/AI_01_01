Read:
- blueprint/checkin/AGENTS.md
- blueprint/checkin/README.md
- blueprint/checkin/db/checkin_tables.csv
- blueprint/checkin/db/checkin_sql_blueprint.md
- blueprint/checkin/schemas/checkin_domain_enums.yaml

Task:
Implement the backend domain skeleton for the check-in feature.

Requirements:
- create one canonical per-user per-local-date record
- preserve same-day edit history with immutable versions
- support status: draft, submitted, skipped
- keep raw payload and derived features separate
- do not add outing, journaling, or CBT-specific fields
- generate migration files and repository/service skeletons
- add clear comments only where needed

Output:
- domain model
- DB migration(s)
- repository layer
- service layer
- unit tests for basic create and edit flows
