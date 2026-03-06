-- core service account
CREATE TABLE IF NOT EXISTS account_user (
  user_id TEXT PRIMARY KEY,
  firebase_uid TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  nickname TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  account_status TEXT NOT NULL, -- pending_email_verification / active_onboarding_required / active / restricted / suspended / deleted
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- model-facing subject id
CREATE TABLE IF NOT EXISTS account_ml_subject (
  user_id TEXT PRIMARY KEY,
  ml_subject_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- profile after onboarding
CREATE TABLE IF NOT EXISTS account_profile (
  user_id TEXT PRIMARY KEY,
  birth_year INTEGER,
  gender TEXT, -- female/male/nonbinary/prefer_not_to_say
  profile_completed_at TIMESTAMP
);

-- consent snapshots
CREATE TABLE IF NOT EXISTS account_consent (
  consent_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  consent_type TEXT NOT NULL, -- terms/privacy/sensitive_data/personalization/model_improvement/marketing
  consent_value INTEGER NOT NULL, -- 0/1
  consent_version TEXT NOT NULL,
  captured_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- onboarding state
CREATE TABLE IF NOT EXISTS account_onboarding (
  user_id TEXT PRIMARY KEY,
  onboarding_status TEXT NOT NULL, -- not_started/profile_pending/baseline_pending/complete
  baseline_assessment_completed INTEGER NOT NULL DEFAULT 0,
  dashboard_bootstrapped INTEGER NOT NULL DEFAULT 0,
  model_bootstrapped INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- firebase event/audit
CREATE TABLE IF NOT EXISTS auth_event_log (
  event_id TEXT PRIMARY KEY,
  user_id TEXT,
  firebase_uid TEXT,
  event_type TEXT NOT NULL, -- signup/email_verification_sent/email_verified/password_reset_sent/login_success/login_failed/reauth_required
  event_payload_json TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
