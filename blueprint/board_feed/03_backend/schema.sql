-- Core posts
CREATE TABLE IF NOT EXISTS board_post (
  post_id TEXT PRIMARY KEY,
  feed_public_id TEXT NOT NULL UNIQUE,
  author_user_id TEXT NOT NULL,
  title TEXT,
  display_title TEXT,
  body_text TEXT NOT NULL,
  body_preview TEXT NOT NULL,
  is_anonymous INTEGER NOT NULL DEFAULT 0,
  is_notice INTEGER NOT NULL DEFAULT 0,
  is_pinned_notice INTEGER NOT NULL DEFAULT 0,
  visibility_status TEXT NOT NULL DEFAULT 'visible',
  moderation_status TEXT NOT NULL DEFAULT 'clear',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS board_post_image (
  image_id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  display_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS board_tag (
  tag_id TEXT PRIMARY KEY,
  tag_name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS board_post_tag (
  post_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (post_id, tag_id)
);

CREATE TABLE IF NOT EXISTS board_comment (
  comment_id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  body_text TEXT NOT NULL,
  is_anonymous INTEGER NOT NULL DEFAULT 0,
  visibility_status TEXT NOT NULL DEFAULT 'visible',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS board_like (
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS board_bookmark (
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS board_report (
  report_id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL, -- post/comment
  target_id TEXT NOT NULL,
  reporter_user_id TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  detail_text TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  review_status TEXT NOT NULL DEFAULT 'queued'
);

CREATE TABLE IF NOT EXISTS board_moderation_event (
  event_id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  source_type TEXT NOT NULL, -- report/model/manual
  category_code TEXT,
  confidence REAL,
  action_code TEXT, -- queued/auto_hidden/restored/warned/banned
  actor_user_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
