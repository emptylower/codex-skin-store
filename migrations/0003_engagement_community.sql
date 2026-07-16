-- Community delivery: auth intents, favorites, comments, reports, events.
-- Timestamps remain unix milliseconds (INTEGER).

CREATE TABLE auth_intents (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  action TEXT NOT NULL CHECK(action IN ('download','copy_prompt','favorite','comment','report')),
  theme_id TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX auth_intents_expires_at_idx ON auth_intents(expires_at);
CREATE INDEX auth_intents_theme_id_idx ON auth_intents(theme_id);

CREATE TABLE favorites (
  user_id TEXT NOT NULL,
  theme_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, theme_id)
);

CREATE INDEX favorites_theme_id_idx ON favorites(theme_id);
CREATE INDEX favorites_user_created_idx ON favorites(user_id, created_at DESC);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  theme_id TEXT NOT NULL,
  user_id TEXT,
  author_label TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL CHECK(status IN ('visible','hidden_by_author','removed_by_admin','deleted_by_user')),
  created_at INTEGER NOT NULL,
  edited_at INTEGER
);

CREATE INDEX comments_theme_created_idx ON comments(theme_id, created_at DESC);
CREATE INDEX comments_theme_status_idx ON comments(theme_id, status);
CREATE INDEX comments_user_id_idx ON comments(user_id);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT,
  target_type TEXT NOT NULL CHECK(target_type IN ('theme','comment','user')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL CHECK(status IN ('open','dismissed','resolved')),
  resolved_by TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);

CREATE INDEX reports_open_idx ON reports(status, created_at DESC);
CREATE INDEX reports_target_idx ON reports(target_type, target_id);
CREATE INDEX reports_reporter_idx ON reports(reporter_id, created_at DESC);

CREATE TABLE moderation_actions (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('theme','comment','user','report','copyright_claim')),
  target_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX moderation_actions_target_idx ON moderation_actions(target_type, target_id);
CREATE INDEX moderation_actions_created_idx ON moderation_actions(created_at DESC);

CREATE TABLE engagement_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  theme_id TEXT NOT NULL,
  theme_version INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('download','prompt_copy','favorite_add','favorite_remove')),
  platform TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX engagement_events_theme_type_time_idx
  ON engagement_events(theme_id, event_type, created_at DESC);
CREATE INDEX engagement_events_created_idx ON engagement_events(created_at DESC);
CREATE INDEX engagement_events_user_theme_type_idx
  ON engagement_events(user_id, theme_id, event_type, created_at DESC);

-- Materialized trend score for marketplace ranking (reconciled from events).
ALTER TABLE themes ADD COLUMN trend_score INTEGER NOT NULL DEFAULT 0;

-- Sliding-window abuse counters (store only hashed subjects, never raw IP).
CREATE TABLE rate_limit_windows (
  bucket_key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(bucket_key, window_start)
);

CREATE INDEX rate_limit_windows_window_idx ON rate_limit_windows(window_start);
