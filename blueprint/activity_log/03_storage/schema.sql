-- User-facing activity log mart
CREATE TABLE IF NOT EXISTS user_day_activity_log (
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  has_checkin INTEGER NOT NULL DEFAULT 0,
  has_challenge_activity INTEGER NOT NULL DEFAULT 0,
  challenge_completed_count INTEGER NOT NULL DEFAULT 0,
  active_challenge_count INTEGER NOT NULL DEFAULT 0,
  has_cbt_activity INTEGER NOT NULL DEFAULT 0,
  cbt_session_count INTEGER NOT NULL DEFAULT 0,
  has_journal_entry INTEGER NOT NULL DEFAULT 0,
  journal_entry_count INTEGER NOT NULL DEFAULT 0,
  has_assessment INTEGER NOT NULL DEFAULT 0,
  activity_count_total INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE IF NOT EXISTS user_day_activity_log_item (
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  activity_type TEXT NOT NULL,  -- checkin/challenge/cbt/journal/assessment
  source_id TEXT,
  display_label TEXT NOT NULL,
  preview_text TEXT,
  count_value INTEGER,
  detail_route TEXT NOT NULL,
  PRIMARY KEY (user_id, date, activity_type, detail_route)
);
