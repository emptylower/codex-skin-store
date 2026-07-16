-- Release gate: copyright claims, SEO review fields, metric indexes.
-- Timestamps remain unix milliseconds (INTEGER).

CREATE TABLE copyright_claims (
  id TEXT PRIMARY KEY,
  claimant_email TEXT NOT NULL,
  claimant_name TEXT NOT NULL,
  target_theme_id TEXT NOT NULL,
  rights_basis TEXT NOT NULL,
  statement TEXT NOT NULL,
  signature TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'open',
      'needs_information',
      'accepted',
      'rejected',
      'withdrawn'
    )
  ),
  assigned_to TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);

CREATE INDEX copyright_claims_status_idx
  ON copyright_claims (status, created_at DESC);
CREATE INDEX copyright_claims_theme_idx
  ON copyright_claims (target_theme_id, created_at DESC);

CREATE TABLE copyright_evidence (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES copyright_claims (id),
  object_key TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  media_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX copyright_evidence_claim_idx
  ON copyright_evidence (claim_id);

-- SEO landing index / rollout controls (eligibility_status retained for legacy filters).
ALTER TABLE seo_landings ADD COLUMN index_status TEXT NOT NULL DEFAULT 'candidate'
  CHECK (index_status IN ('candidate', 'approved', 'paused', 'retired'));
ALTER TABLE seo_landings ADD COLUMN rollout_batch INTEGER;
ALTER TABLE seo_landings ADD COLUMN eligibility_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE seo_landings ADD COLUMN reviewed_by TEXT;
ALTER TABLE seo_landings ADD COLUMN reviewed_at INTEGER;

CREATE INDEX seo_landings_index_status_idx
  ON seo_landings (index_status, rollout_batch);

-- Expand translation review states and uniqueness evidence.
-- SQLite cannot alter CHECK constraints in place; rebuild the table.
CREATE TABLE seo_landing_translations_new (
  id TEXT PRIMARY KEY,
  landing_id TEXT NOT NULL REFERENCES seo_landings (id),
  locale TEXT NOT NULL CHECK (locale IN ('en', 'zh-hans')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  body_markdown TEXT NOT NULL DEFAULT '',
  translation_status TEXT NOT NULL DEFAULT 'draft' CHECK (
    translation_status IN ('draft', 'reviewed', 'stale')
  ),
  intro TEXT NOT NULL DEFAULT '',
  faq_json TEXT NOT NULL DEFAULT '[]',
  seo_title TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  uniqueness_score REAL,
  uniqueness_json TEXT NOT NULL DEFAULT '{}',
  reviewed_by TEXT,
  reviewed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (landing_id, locale)
);

INSERT INTO seo_landing_translations_new (
  id,
  landing_id,
  locale,
  title,
  description,
  body_markdown,
  translation_status,
  intro,
  faq_json,
  seo_title,
  seo_description,
  uniqueness_score,
  uniqueness_json,
  reviewed_by,
  reviewed_at,
  created_at,
  updated_at
)
SELECT
  id,
  landing_id,
  locale,
  title,
  description,
  body_markdown,
  translation_status,
  '',
  '[]',
  '',
  '',
  NULL,
  '{}',
  NULL,
  NULL,
  created_at,
  updated_at
FROM seo_landing_translations;

DROP TABLE seo_landing_translations;
ALTER TABLE seo_landing_translations_new RENAME TO seo_landing_translations;

CREATE INDEX seo_landing_translations_status_idx
  ON seo_landing_translations (translation_status, locale);

-- Expand moderation target types for SEO/admin review audits.
CREATE TABLE moderation_actions_new (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (
    target_type IN (
      'theme',
      'comment',
      'user',
      'report',
      'copyright_claim',
      'seo_landing'
    )
  ),
  target_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

INSERT INTO moderation_actions_new
SELECT
  id,
  actor_id,
  target_type,
  target_id,
  action,
  reason,
  before_json,
  after_json,
  created_at
FROM moderation_actions;

DROP TABLE moderation_actions;
ALTER TABLE moderation_actions_new RENAME TO moderation_actions;

CREATE INDEX moderation_actions_target_idx
  ON moderation_actions (target_type, target_id);
CREATE INDEX moderation_actions_created_idx
  ON moderation_actions (created_at DESC);

-- Metric query support (bounded time windows).
CREATE INDEX engagement_events_type_time_idx
  ON engagement_events (event_type, created_at DESC);
CREATE INDEX engagement_events_user_time_idx
  ON engagement_events (user_id, created_at DESC);
CREATE INDEX themes_public_ready_idx
  ON themes (visibility, package_status, moderation_status, updated_at DESC);
CREATE INDEX comments_status_created_idx
  ON comments (status, created_at DESC);
CREATE INDEX reports_status_created_idx
  ON reports (status, created_at DESC);
