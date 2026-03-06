-- Assessment tables (simplified)
-- periodic_assessment: one session header per completion attempt
CREATE TABLE IF NOT EXISTS periodic_assessment (
  assessment_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  scheduled_for DATE,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  status TEXT NOT NULL, -- draft/completed/late/missed/skipped
  recommended_cycle_days INTEGER NOT NULL DEFAULT 28,
  source TEXT NOT NULL, -- onboarding/28day_reminder/manual_start/...
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- item-level responses
CREATE TABLE IF NOT EXISTS assessment_item_response (
  assessment_id TEXT NOT NULL,
  instrument TEXT NOT NULL, -- phq9/gad7/isi
  item_code TEXT NOT NULL,  -- PHQ9_1..PHQ9_9, GAD7_1..GAD7_7, ISI_1..ISI_7
  display_order INTEGER NOT NULL,
  response_score INTEGER NOT NULL,
  response_label TEXT,
  answered_at TIMESTAMP NOT NULL,
  PRIMARY KEY (assessment_id, instrument, item_code)
);

-- totals + bands + safety flags
CREATE TABLE IF NOT EXISTS assessment_score (
  assessment_id TEXT PRIMARY KEY,
  phq9_total INTEGER,
  gad7_total INTEGER,
  isi_total INTEGER,
  phq9_band TEXT,
  gad7_band TEXT,
  isi_band TEXT,
  phq9_item9_nonzero INTEGER DEFAULT 0,
  computed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
