-- MyPage related projection / preferences
CREATE TABLE IF NOT EXISTS user_profile (
  user_id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  birth_year INTEGER,
  gender TEXT,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id TEXT PRIMARY KEY,
  mypage_notification_enabled INTEGER NOT NULL DEFAULT 1,
  support_reply_notification_enabled INTEGER NOT NULL DEFAULT 1,
  board_activity_notification_enabled INTEGER NOT NULL DEFAULT 1,
  report_ready_notification_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS user_consents (
  user_id TEXT PRIMARY KEY,
  terms_agreed INTEGER NOT NULL DEFAULT 0,
  privacy_agreed INTEGER NOT NULL DEFAULT 0,
  sensitive_data_agreed INTEGER NOT NULL DEFAULT 0,
  personalization_agreed INTEGER NOT NULL DEFAULT 0,
  marketing_agreed INTEGER NOT NULL DEFAULT 0, -- placeholder for future
  updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  audit_id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  metadata_json TEXT,
  created_at TIMESTAMP NOT NULL
);
