Read:
- blueprint/checkin/api/openapi_checkin.yaml
- blueprint/checkin/schemas/checkin_payload.schema.json
- blueprint/checkin/data/checkin_validation_rules.csv

Task:
Implement API endpoints and request validation for the check-in feature.

Requirements:
- GET /checkin/today
- POST /checkin/today
- POST /checkin/today/skip
- GET /checkin/history
- GET /checkin/summary
- validate enums and time format
- return clear error payloads
- prevent duplicate active records for same user and local date

Do not:
- expose internal derived-feature tables directly
- mix challenge or CBT payloads into this API
