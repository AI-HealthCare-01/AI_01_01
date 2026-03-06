# 이벤트 로그(추천)

- assessment_started
- assessment_item_answered
- assessment_completed
- assessment_abandoned (draft -> no completion after N days)
- assessment_exported (pdf/png, if supported)

필드(최소):
- user_id, assessment_id, instrument, item_code(optional), timestamp, source
