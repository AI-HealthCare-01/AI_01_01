CREATE TABLE IF NOT EXISTS journal_entry (
  journal_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  entry_date DATE NOT NULL,
  title TEXT,
  body TEXT NOT NULL,
  preview_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active/deleted
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_journal_entry_user_date
ON journal_entry(user_id, entry_date DESC);
