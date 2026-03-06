-- Base admin account role mapping
CREATE TABLE IF NOT EXISTS admin_account_role (
  admin_user_id TEXT PRIMARY KEY,
  base_role TEXT NOT NULL CHECK (base_role IN ('owner','admin','support')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Optional extension for support users
CREATE TABLE IF NOT EXISTS admin_capability_extension (
  extension_id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  extension_code TEXT NOT NULL, -- analyst_ml_extension
  status TEXT NOT NULL,         -- requested/approved/rejected/revoked
  requested_at TIMESTAMP NOT NULL,
  approved_at TIMESTAMP,
  approved_by TEXT,
  note TEXT
);

-- Admin notifications / queues
CREATE TABLE IF NOT EXISTS admin_notification (
  notification_id TEXT PRIMARY KEY,
  queue_code TEXT NOT NULL,     -- support_queue/moderation_queue/safety_queue/ops_queue/ml_queue
  related_object_type TEXT NOT NULL,
  related_object_id TEXT NOT NULL,
  severity TEXT NOT NULL,       -- low/medium/high/critical
  status TEXT NOT NULL,         -- unread/read/resolved
  created_at TIMESTAMP NOT NULL,
  assigned_admin_user_id TEXT
);

-- Restriction actions
CREATE TABLE IF NOT EXISTS restriction_action (
  action_id TEXT PRIMARY KEY,
  target_user_id TEXT NOT NULL,
  target_email TEXT,
  target_ip TEXT,
  block_account INTEGER NOT NULL DEFAULT 0,
  block_ip INTEGER NOT NULL DEFAULT 0,
  reason_code TEXT NOT NULL,
  reason_detail TEXT,
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP,
  created_by_admin_user_id TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL
);

-- Policy/model change requests
CREATE TABLE IF NOT EXISTS owner_approval_request (
  approval_id TEXT PRIMARY KEY,
  object_type TEXT NOT NULL,     -- policy_change/model_change
  object_id TEXT NOT NULL,
  status TEXT NOT NULL,          -- pending_owner_approval/approved/rejected
  requested_by_admin_user_id TEXT NOT NULL,
  requested_at TIMESTAMP NOT NULL,
  decided_by_owner_user_id TEXT,
  decided_at TIMESTAMP,
  decision_note TEXT
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  audit_id TEXT PRIMARY KEY,
  actor_admin_user_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  metadata_json TEXT,
  created_at TIMESTAMP NOT NULL
);
