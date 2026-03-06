-- Support ticket header
CREATE TABLE IF NOT EXISTS support_ticket (
  ticket_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ticket_type TEXT NOT NULL,          -- inquiry | feedback
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  related_feature TEXT,
  reply_requested INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,               -- new | waiting_admin | in_progress | answered | waiting_user | reopened | resolved | closed
  priority TEXT NOT NULL DEFAULT 'normal',
  sensitive_queue_flag INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  resolved_at TIMESTAMP,
  closed_at TIMESTAMP
);

-- Conversation messages
CREATE TABLE IF NOT EXISTS support_message (
  message_id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  author_type TEXT NOT NULL,          -- user | admin | system
  author_id TEXT,
  body TEXT NOT NULL,
  is_followup INTEGER NOT NULL DEFAULT 0,
  internal_only INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL
);

-- Attachments
CREATE TABLE IF NOT EXISTS support_attachment (
  attachment_id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  message_id TEXT,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL
);

-- Notifications
CREATE TABLE IF NOT EXISTS support_notification (
  notification_id TEXT PRIMARY KEY,
  recipient_type TEXT NOT NULL,       -- admin | user
  recipient_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  event_type TEXT NOT NULL,           -- new_ticket | admin_reply | user_followup | status_changed | sensitive_flag
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL,
  read_at TIMESTAMP
);

-- Status history / audit
CREATE TABLE IF NOT EXISTS support_status_history (
  history_id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by_type TEXT NOT NULL,      -- user | admin | system
  changed_by_id TEXT,
  note TEXT,
  created_at TIMESTAMP NOT NULL
);
