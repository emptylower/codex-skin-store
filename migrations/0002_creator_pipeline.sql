-- Better Auth identity extensions + creator upload/package pipeline state.
-- Timestamps remain unix milliseconds (INTEGER).
-- Extends existing users/theme_versions; do not recreate catalog tables.

ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0 CHECK(email_verified IN (0,1));
ALTER TABLE users ADD COLUMN deletion_status TEXT NOT NULL DEFAULT 'active' CHECK(deletion_status IN ('active','auth_cleanup_pending','deleted'));
CREATE UNIQUE INDEX users_email_unique ON users(lower(email)) WHERE email IS NOT NULL;

CREATE TABLE accounts(
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  password TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(provider_id, account_id)
);

CREATE TABLE sessions(
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE verifications(
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);

ALTER TABLE theme_versions ADD COLUMN creator_input_json TEXT;
ALTER TABLE theme_versions ADD COLUMN generation_state TEXT NOT NULL DEFAULT 'ready' CHECK(generation_state IN ('awaiting_upload','queued','processing','ready','failed'));
ALTER TABLE theme_versions ADD COLUMN source_key TEXT;
ALTER TABLE theme_versions ADD COLUMN source_filename TEXT;
ALTER TABLE theme_versions ADD COLUMN source_mime TEXT;
ALTER TABLE theme_versions ADD COLUMN source_bytes INTEGER;
ALTER TABLE theme_versions ADD COLUMN source_width INTEGER;
ALTER TABLE theme_versions ADD COLUMN source_height INTEGER;
ALTER TABLE theme_versions ADD COLUMN source_sha256 TEXT;
ALTER TABLE theme_versions ADD COLUMN preview_key TEXT;
ALTER TABLE theme_versions ADD COLUMN preview_bytes INTEGER;
ALTER TABLE theme_versions ADD COLUMN preview_sha256 TEXT;
ALTER TABLE theme_versions ADD COLUMN manifest_key TEXT;
ALTER TABLE theme_versions ADD COLUMN macos_adapter_key TEXT;
ALTER TABLE theme_versions ADD COLUMN windows_adapter_key TEXT;
ALTER TABLE theme_versions ADD COLUMN install_key TEXT;
ALTER TABLE theme_versions ADD COLUMN prompt_key TEXT;
ALTER TABLE theme_versions ADD COLUMN archive_bytes INTEGER;
ALTER TABLE theme_versions ADD COLUMN generated_at INTEGER;
ALTER TABLE theme_versions ADD COLUMN generation_error_code TEXT;
ALTER TABLE theme_versions ADD COLUMN generation_error_detail TEXT;

CREATE TABLE source_uploads(
  id TEXT PRIMARY KEY,
  theme_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quarantine_key TEXT NOT NULL UNIQUE,
  declared_content_type TEXT NOT NULL,
  expected_bytes INTEGER NOT NULL CHECK(expected_bytes BETWEEN 1 AND 25000000),
  state TEXT NOT NULL CHECK(state IN ('issued','completed','rejected')),
  r2_etag TEXT,
  expires_at INTEGER NOT NULL,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE(theme_id, version),
  FOREIGN KEY(theme_id, version) REFERENCES theme_versions(theme_id, version) ON DELETE CASCADE
);

CREATE TABLE package_jobs(
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  theme_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('queued','leased','succeeded','failed')),
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  available_at INTEGER NOT NULL,
  lease_owner TEXT,
  lease_expires_at INTEGER,
  last_error_code TEXT,
  last_error_detail TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER,
  FOREIGN KEY(theme_id, version) REFERENCES theme_versions(theme_id, version) ON DELETE CASCADE
);

CREATE INDEX package_jobs_sweep_idx ON package_jobs(state, available_at, lease_expires_at);
