-- Catalog + SEO base schema for the public marketplace.
-- Timestamps are unix milliseconds (INTEGER).
-- Milestone 2 extends users/theme_versions via ALTER TABLE; do not recreate them.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
  upload_status TEXT NOT NULL DEFAULT 'active' CHECK (upload_status IN ('active', 'suspended')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE themes (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users (id),
  slug TEXT NOT NULL UNIQUE,
  source_locale TEXT NOT NULL CHECK (source_locale IN ('en', 'zh-hans')),
  current_version INTEGER,
  visibility TEXT NOT NULL CHECK (visibility IN ('draft', 'public', 'unlisted', 'hidden')),
  moderation_status TEXT NOT NULL CHECK (moderation_status IN ('clean', 'flagged', 'removed')),
  package_status TEXT NOT NULL CHECK (package_status IN ('processing', 'ready', 'failed')),
  favorites_count INTEGER NOT NULL DEFAULT 0,
  downloads_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE theme_versions (
  id TEXT PRIMARY KEY,
  theme_id TEXT NOT NULL REFERENCES themes (id),
  version INTEGER NOT NULL,
  manifest_json TEXT NOT NULL,
  package_key TEXT,
  payload_digest TEXT,
  archive_digest TEXT,
  published_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (theme_id, version)
);

CREATE TABLE theme_translations (
  id TEXT PRIMARY KEY,
  theme_id TEXT NOT NULL REFERENCES themes (id),
  locale TEXT NOT NULL CHECK (locale IN ('en', 'zh-hans')),
  name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  translation_status TEXT NOT NULL DEFAULT 'draft' CHECK (translation_status IN ('draft', 'reviewed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (theme_id, locale)
);

CREATE TABLE taxonomies (
  id TEXT PRIMARY KEY,
  dimension TEXT NOT NULL,
  key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (dimension, key)
);

CREATE TABLE taxonomy_translations (
  id TEXT PRIMARY KEY,
  taxonomy_id TEXT NOT NULL REFERENCES taxonomies (id),
  locale TEXT NOT NULL CHECK (locale IN ('en', 'zh-hans')),
  label TEXT NOT NULL,
  synonyms_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (taxonomy_id, locale)
);

CREATE TABLE theme_taxonomies (
  theme_id TEXT NOT NULL REFERENCES themes (id),
  taxonomy_id TEXT NOT NULL REFERENCES taxonomies (id),
  PRIMARY KEY (theme_id, taxonomy_id)
);

CREATE TABLE seo_landings (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  dimension TEXT,
  taxonomy_key TEXT,
  eligibility_status TEXT NOT NULL DEFAULT 'candidate' CHECK (
    eligibility_status IN ('candidate', 'eligible', 'excluded')
  ),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE seo_landing_translations (
  id TEXT PRIMARY KEY,
  landing_id TEXT NOT NULL REFERENCES seo_landings (id),
  locale TEXT NOT NULL CHECK (locale IN ('en', 'zh-hans')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  body_markdown TEXT NOT NULL DEFAULT '',
  translation_status TEXT NOT NULL DEFAULT 'draft' CHECK (translation_status IN ('draft', 'reviewed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (landing_id, locale)
);

CREATE INDEX idx_themes_author_id ON themes (author_id);
CREATE INDEX idx_themes_visibility_moderation_package ON themes (visibility, moderation_status, package_status);
CREATE INDEX idx_theme_versions_theme_id ON theme_versions (theme_id);
CREATE INDEX idx_theme_translations_locale ON theme_translations (locale);
CREATE INDEX idx_taxonomies_dimension ON taxonomies (dimension);
CREATE INDEX idx_theme_taxonomies_taxonomy_id ON theme_taxonomies (taxonomy_id);
CREATE INDEX idx_seo_landings_eligibility ON seo_landings (eligibility_status);
