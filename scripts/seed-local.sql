-- Deterministic bilingual catalog seed for local development.
-- Idempotent: safe to re-run (ON CONFLICT DO UPDATE / DO NOTHING).
-- Timestamps are fixed unix milliseconds.

-- Creators
INSERT INTO users (id, handle, display_name, avatar_url, bio, role, upload_status, created_at, updated_at)
VALUES
  (
    'user-nova-chen',
    'nova-chen',
    'Nova Chen',
    '/demo-themes/neon-road.png',
    'Designs high-contrast Codex shells for late-night coding.',
    'user',
    'active',
    1700000000000,
    1700000000000
  ),
  (
    'user-lin-park',
    'lin-park',
    'Lin Park',
    '/demo-themes/paper-studio.png',
    'Focuses on calm, paper-like themes for long writing sessions.',
    'user',
    'active',
    1700000001000,
    1700000001000
  )
ON CONFLICT(id) DO UPDATE SET
  handle = excluded.handle,
  display_name = excluded.display_name,
  avatar_url = excluded.avatar_url,
  bio = excluded.bio,
  role = excluded.role,
  upload_status = excluded.upload_status,
  updated_at = excluded.updated_at;

-- Controlled taxonomies
INSERT INTO taxonomies (id, dimension, key, created_at, updated_at)
VALUES
  ('tax-style-neon', 'style', 'neon', 1700000010000, 1700000010000),
  ('tax-style-minimal', 'style', 'minimal', 1700000010000, 1700000010000),
  ('tax-style-retro', 'style', 'retro', 1700000010000, 1700000010000),
  ('tax-style-ink', 'style', 'ink', 1700000010000, 1700000010000),
  ('tax-mood-focus', 'mood', 'focus', 1700000010000, 1700000010000),
  ('tax-mood-cozy', 'mood', 'cozy', 1700000010000, 1700000010000),
  ('tax-mood-energetic', 'mood', 'energetic', 1700000010000, 1700000010000),
  ('tax-mood-calm', 'mood', 'calm', 1700000010000, 1700000010000),
  ('tax-mode-dark', 'mode', 'dark', 1700000010000, 1700000010000),
  ('tax-mode-light', 'mode', 'light', 1700000010000, 1700000010000)
ON CONFLICT(dimension, key) DO UPDATE SET
  updated_at = excluded.updated_at;

INSERT INTO taxonomy_translations (id, taxonomy_id, locale, label, synonyms_json, created_at, updated_at)
VALUES
  ('tt-style-neon-en', 'tax-style-neon', 'en', 'Neon', '["cyber","glow","synthwave"]', 1700000011000, 1700000011000),
  ('tt-style-neon-zh', 'tax-style-neon', 'zh-hans', '霓虹', '["赛博","发光","合成波"]', 1700000011000, 1700000011000),
  ('tt-style-minimal-en', 'tax-style-minimal', 'en', 'Minimal', '["clean","simple","sparse"]', 1700000011000, 1700000011000),
  ('tt-style-minimal-zh', 'tax-style-minimal', 'zh-hans', '极简', '["干净","简洁","留白"]', 1700000011000, 1700000011000),
  ('tt-style-retro-en', 'tax-style-retro', 'en', 'Retro', '["pixel","arcade","vintage"]', 1700000011000, 1700000011000),
  ('tt-style-retro-zh', 'tax-style-retro', 'zh-hans', '复古', '["像素","街机","怀旧"]', 1700000011000, 1700000011000),
  ('tt-style-ink-en', 'tax-style-ink', 'en', 'Ink', '["brush","calligraphy","scroll"]', 1700000011000, 1700000011000),
  ('tt-style-ink-zh', 'tax-style-ink', 'zh-hans', '水墨', '["毛笔","书法","卷轴"]', 1700000011000, 1700000011000),
  ('tt-mood-focus-en', 'tax-mood-focus', 'en', 'Focus', '["deep work","concentration"]', 1700000011000, 1700000011000),
  ('tt-mood-focus-zh', 'tax-mood-focus', 'zh-hans', '专注', '["深度工作","集中"]', 1700000011000, 1700000011000),
  ('tt-mood-cozy-en', 'tax-mood-cozy', 'en', 'Cozy', '["warm","soft","homey"]', 1700000011000, 1700000011000),
  ('tt-mood-cozy-zh', 'tax-mood-cozy', 'zh-hans', '温馨', '["温暖","柔和","居家"]', 1700000011000, 1700000011000),
  ('tt-mood-energetic-en', 'tax-mood-energetic', 'en', 'Energetic', '["vivid","bold","bright"]', 1700000011000, 1700000011000),
  ('tt-mood-energetic-zh', 'tax-mood-energetic', 'zh-hans', '活力', '["鲜明","大胆","明亮"]', 1700000011000, 1700000011000),
  ('tt-mood-calm-en', 'tax-mood-calm', 'en', 'Calm', '["serene","quiet","peaceful"]', 1700000011000, 1700000011000),
  ('tt-mood-calm-zh', 'tax-mood-calm', 'zh-hans', '平静', '["宁静","安静","平和"]', 1700000011000, 1700000011000),
  ('tt-mode-dark-en', 'tax-mode-dark', 'en', 'Dark', '["night","dim"]', 1700000011000, 1700000011000),
  ('tt-mode-dark-zh', 'tax-mode-dark', 'zh-hans', '深色', '["夜间","暗色"]', 1700000011000, 1700000011000),
  ('tt-mode-light-en', 'tax-mode-light', 'en', 'Light', '["day","bright"]', 1700000011000, 1700000011000),
  ('tt-mode-light-zh', 'tax-mode-light', 'zh-hans', '浅色', '["日间","明亮"]', 1700000011000, 1700000011000)
ON CONFLICT(id) DO UPDATE SET
  label = excluded.label,
  synonyms_json = excluded.synonyms_json,
  updated_at = excluded.updated_at;

-- Themes (public / clean / ready)
INSERT INTO themes (
  id, author_id, slug, source_locale, current_version,
  visibility, moderation_status, package_status,
  favorites_count, downloads_count, created_at, updated_at
)
VALUES
  ('theme-neon-road', 'user-nova-chen', 'neon-road', 'en', 1, 'public', 'clean', 'ready', 42, 180, 1700000100000, 1700000100000),
  ('theme-paper-studio', 'user-lin-park', 'paper-studio', 'en', 1, 'public', 'clean', 'ready', 31, 140, 1700000101000, 1700000101000),
  ('theme-midnight-harbor', 'user-nova-chen', 'midnight-harbor', 'en', 1, 'public', 'clean', 'ready', 27, 96, 1700000102000, 1700000102000),
  ('theme-solar-grove', 'user-lin-park', 'solar-grove', 'en', 1, 'public', 'clean', 'ready', 19, 72, 1700000103000, 1700000103000),
  ('theme-frost-terminal', 'user-nova-chen', 'frost-terminal', 'en', 1, 'public', 'clean', 'ready', 55, 210, 1700000104000, 1700000104000),
  ('theme-amber-atelier', 'user-lin-park', 'amber-atelier', 'en', 1, 'public', 'clean', 'ready', 22, 88, 1700000105000, 1700000105000),
  ('theme-pixel-arcade', 'user-nova-chen', 'pixel-arcade', 'en', 1, 'public', 'clean', 'ready', 64, 250, 1700000106000, 1700000106000),
  ('theme-ink-scroll', 'user-lin-park', 'ink-scroll', 'zh-hans', 1, 'public', 'clean', 'ready', 38, 160, 1700000107000, 1700000107000)
ON CONFLICT(id) DO UPDATE SET
  author_id = excluded.author_id,
  slug = excluded.slug,
  source_locale = excluded.source_locale,
  current_version = excluded.current_version,
  visibility = excluded.visibility,
  moderation_status = excluded.moderation_status,
  package_status = excluded.package_status,
  favorites_count = excluded.favorites_count,
  downloads_count = excluded.downloads_count,
  updated_at = excluded.updated_at;

-- Theme versions (platforms/mode live in manifest_json)
INSERT INTO theme_versions (
  id, theme_id, version, manifest_json, package_key,
  payload_digest, archive_digest, published_at, created_at, updated_at
)
VALUES
  (
    'tv-neon-road-1', 'theme-neon-road', 1,
    '{"platform":"both","mode":"dark","previewImage":"/demo-themes/neon-road-cover.svg","coverImage":"/demo-themes/neon-road.png","adapters":{"codex":{"shell":"glass","accent":"#22d3ee"}}}',
    'packages/neon-road/v1.zip', 'sha256:neon-road-payload', 'sha256:neon-road-archive',
    1700000200000, 1700000200000, 1700000200000
  ),
  (
    'tv-paper-studio-1', 'theme-paper-studio', 1,
    '{"platform":"macos","mode":"light","previewImage":"/demo-themes/paper-studio-cover.svg","coverImage":"/demo-themes/paper-studio.png","adapters":{"codex":{"shell":"paper","accent":"#a16207"}}}',
    'packages/paper-studio/v1.zip', 'sha256:paper-studio-payload', 'sha256:paper-studio-archive',
    1700000201000, 1700000201000, 1700000201000
  ),
  (
    'tv-midnight-harbor-1', 'theme-midnight-harbor', 1,
    '{"platform":"windows","mode":"dark","previewImage":"/demo-themes/midnight-harbor-cover.svg","coverImage":"/demo-themes/midnight-harbor.png","adapters":{"codex":{"shell":"matte","accent":"#38bdf8"}}}',
    'packages/midnight-harbor/v1.zip', 'sha256:midnight-harbor-payload', 'sha256:midnight-harbor-archive',
    1700000202000, 1700000202000, 1700000202000
  ),
  (
    'tv-solar-grove-1', 'theme-solar-grove', 1,
    '{"platform":"both","mode":"light","previewImage":"/demo-themes/solar-grove-cover.svg","coverImage":"/demo-themes/solar-grove.png","adapters":{"codex":{"shell":"organic","accent":"#65a30d"}}}',
    'packages/solar-grove/v1.zip', 'sha256:solar-grove-payload', 'sha256:solar-grove-archive',
    1700000203000, 1700000203000, 1700000203000
  ),
  (
    'tv-frost-terminal-1', 'theme-frost-terminal', 1,
    '{"platform":"macos","mode":"dark","previewImage":"/demo-themes/frost-terminal-cover.svg","coverImage":"/demo-themes/frost-terminal.png","adapters":{"codex":{"shell":"terminal","accent":"#67e8f9"}}}',
    'packages/frost-terminal/v1.zip', 'sha256:frost-terminal-payload', 'sha256:frost-terminal-archive',
    1700000204000, 1700000204000, 1700000204000
  ),
  (
    'tv-amber-atelier-1', 'theme-amber-atelier', 1,
    '{"platform":"windows","mode":"light","previewImage":"/demo-themes/amber-atelier-cover.svg","coverImage":"/demo-themes/amber-atelier.png","adapters":{"codex":{"shell":"studio","accent":"#f59e0b"}}}',
    'packages/amber-atelier/v1.zip', 'sha256:amber-atelier-payload', 'sha256:amber-atelier-archive',
    1700000205000, 1700000205000, 1700000205000
  ),
  (
    'tv-pixel-arcade-1', 'theme-pixel-arcade', 1,
    '{"platform":"both","mode":"dark","previewImage":"/demo-themes/pixel-arcade-cover.svg","coverImage":"/demo-themes/pixel-arcade.png","adapters":{"codex":{"shell":"pixel","accent":"#f472b6"}}}',
    'packages/pixel-arcade/v1.zip', 'sha256:pixel-arcade-payload', 'sha256:pixel-arcade-archive',
    1700000206000, 1700000206000, 1700000206000
  ),
  (
    'tv-ink-scroll-1', 'theme-ink-scroll', 1,
    '{"platform":"macos","mode":"light","previewImage":"/demo-themes/ink-scroll-cover.svg","coverImage":"/demo-themes/ink-scroll.png","adapters":{"codex":{"shell":"scroll","accent":"#1f2937"}}}',
    'packages/ink-scroll/v1.zip', 'sha256:ink-scroll-payload', 'sha256:ink-scroll-archive',
    1700000207000, 1700000207000, 1700000207000
  )
ON CONFLICT(id) DO UPDATE SET
  theme_id = excluded.theme_id,
  version = excluded.version,
  manifest_json = excluded.manifest_json,
  package_key = excluded.package_key,
  payload_digest = excluded.payload_digest,
  archive_digest = excluded.archive_digest,
  published_at = excluded.published_at,
  updated_at = excluded.updated_at;

-- Bilingual theme translations
INSERT INTO theme_translations (
  id, theme_id, locale, name, summary, description, translation_status, created_at, updated_at
)
VALUES
  ('tr-neon-road-en', 'theme-neon-road', 'en', 'Neon Road', 'Cyber night drive for Codex.', 'A high-contrast dark shell with cyan accents and glass panels.', 'reviewed', 1700000300000, 1700000300000),
  ('tr-neon-road-zh', 'theme-neon-road', 'zh-hans', '霓虹公路', '适合深夜编码的赛博夜行风格。', '高对比深色外壳，青色点缀与玻璃面板。', 'reviewed', 1700000300000, 1700000300000),
  ('tr-paper-studio-en', 'theme-paper-studio', 'en', 'Paper Studio', 'Soft paper workspace for long drafts.', 'Light mode with warm margins and quiet chrome.', 'reviewed', 1700000301000, 1700000301000),
  ('tr-paper-studio-zh', 'theme-paper-studio', 'zh-hans', '纸间工作室', '适合长文写作的柔和纸感工作区。', '浅色模式，温暖边距与安静的界面边框。', 'reviewed', 1700000301000, 1700000301000),
  ('tr-midnight-harbor-en', 'theme-midnight-harbor', 'en', 'Midnight Harbor', 'Cool harbor lights after dusk.', 'Windows-first dark theme with blue-gray depth.', 'reviewed', 1700000302000, 1700000302000),
  ('tr-midnight-harbor-zh', 'theme-midnight-harbor', 'zh-hans', '午夜港湾', '日落后的清冷港口灯火。', '面向 Windows 的深色主题，蓝灰层次。', 'reviewed', 1700000302000, 1700000302000),
  ('tr-solar-grove-en', 'theme-solar-grove', 'en', 'Solar Grove', 'Sunlit greens for outdoor focus.', 'Bright botanical palette with airy spacing.', 'reviewed', 1700000303000, 1700000303000),
  ('tr-solar-grove-zh', 'theme-solar-grove', 'zh-hans', '日光树丛', '户外感的阳光绿色，适合专注。', '明亮植物色盘与通透间距。', 'reviewed', 1700000303000, 1700000303000),
  ('tr-frost-terminal-en', 'theme-frost-terminal', 'en', 'Frost Terminal', 'Icy CLI aesthetics for deep work.', 'Terminal-inspired frost edges and monospaced cues.', 'reviewed', 1700000304000, 1700000304000),
  ('tr-frost-terminal-zh', 'theme-frost-terminal', 'zh-hans', '霜结终端', '冰冷 CLI 美学，适合深度工作。', '终端灵感的霜边与等宽提示。', 'reviewed', 1700000304000, 1700000304000),
  ('tr-amber-atelier-en', 'theme-amber-atelier', 'en', 'Amber Atelier', 'Warm studio light for creative sessions.', 'Amber highlights on a cream canvas.', 'reviewed', 1700000305000, 1700000305000),
  ('tr-amber-atelier-zh', 'theme-amber-atelier', 'zh-hans', '琥珀工作室', '适合创作时段的温暖工作室灯光。', '奶油画布上的琥珀色高光。', 'reviewed', 1700000305000, 1700000305000),
  ('tr-pixel-arcade-en', 'theme-pixel-arcade', 'en', 'Pixel Arcade', 'Playful retro HUD for side projects.', 'Chunky pixels, magenta glow, and scoreboard chrome.', 'reviewed', 1700000306000, 1700000306000),
  ('tr-pixel-arcade-zh', 'theme-pixel-arcade', 'zh-hans', '像素街机', '适合 side project 的复古 HUD。', '粗像素、品红光晕与记分牌边框。', 'reviewed', 1700000306000, 1700000306000),
  ('tr-ink-scroll-en', 'theme-ink-scroll', 'en', 'Ink Scroll', 'Calligraphic calm for reading and review.', 'Ink washes, soft grain, and restrained contrast.', 'reviewed', 1700000307000, 1700000307000),
  ('tr-ink-scroll-zh', 'theme-ink-scroll', 'zh-hans', '墨卷', '适合阅读与审阅的书法式平静。', '水墨晕染、细腻纹理与克制对比。', 'reviewed', 1700000307000, 1700000307000)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  summary = excluded.summary,
  description = excluded.description,
  translation_status = excluded.translation_status,
  updated_at = excluded.updated_at;

-- Theme ↔ taxonomy links
INSERT INTO theme_taxonomies (theme_id, taxonomy_id)
VALUES
  ('theme-neon-road', 'tax-style-neon'),
  ('theme-neon-road', 'tax-mood-energetic'),
  ('theme-neon-road', 'tax-mode-dark'),
  ('theme-paper-studio', 'tax-style-minimal'),
  ('theme-paper-studio', 'tax-mood-calm'),
  ('theme-paper-studio', 'tax-mode-light'),
  ('theme-midnight-harbor', 'tax-style-minimal'),
  ('theme-midnight-harbor', 'tax-mood-focus'),
  ('theme-midnight-harbor', 'tax-mode-dark'),
  ('theme-solar-grove', 'tax-style-minimal'),
  ('theme-solar-grove', 'tax-mood-cozy'),
  ('theme-solar-grove', 'tax-mode-light'),
  ('theme-frost-terminal', 'tax-style-minimal'),
  ('theme-frost-terminal', 'tax-mood-focus'),
  ('theme-frost-terminal', 'tax-mode-dark'),
  ('theme-amber-atelier', 'tax-style-minimal'),
  ('theme-amber-atelier', 'tax-mood-cozy'),
  ('theme-amber-atelier', 'tax-mode-light'),
  ('theme-pixel-arcade', 'tax-style-retro'),
  ('theme-pixel-arcade', 'tax-mood-energetic'),
  ('theme-pixel-arcade', 'tax-mode-dark'),
  ('theme-ink-scroll', 'tax-style-ink'),
  ('theme-ink-scroll', 'tax-mood-calm'),
  ('theme-ink-scroll', 'tax-mode-light')
ON CONFLICT(theme_id, taxonomy_id) DO NOTHING;

-- SEO landings for a couple of controlled filters
INSERT INTO seo_landings (id, slug, dimension, taxonomy_key, eligibility_status, created_at, updated_at)
VALUES
  ('seo-dark-themes', 'dark-themes', 'mode', 'dark', 'eligible', 1700000400000, 1700000400000),
  ('seo-neon-style', 'neon-style', 'style', 'neon', 'eligible', 1700000401000, 1700000401000),
  ('seo-cozy-mood', 'cozy-mood', 'mood', 'cozy', 'candidate', 1700000402000, 1700000402000)
ON CONFLICT(id) DO UPDATE SET
  slug = excluded.slug,
  dimension = excluded.dimension,
  taxonomy_key = excluded.taxonomy_key,
  eligibility_status = excluded.eligibility_status,
  updated_at = excluded.updated_at;

INSERT INTO seo_landing_translations (
  id, landing_id, locale, title, description, body_markdown, translation_status, created_at, updated_at
)
VALUES
  (
    'seo-tr-dark-en', 'seo-dark-themes', 'en',
    'Dark Codex Themes',
    'Browse dark-mode Codex skins for late-night work.',
    '## Dark themes\n\nHigh-contrast and low-glare shells for night sessions.',
    'reviewed', 1700000410000, 1700000410000
  ),
  (
    'seo-tr-dark-zh', 'seo-dark-themes', 'zh-hans',
    '深色 Codex 主题',
    '浏览适合夜间工作的深色 Codex 皮肤。',
    '## 深色主题\n\n高对比、低眩光的夜间外壳。',
    'reviewed', 1700000410000, 1700000410000
  ),
  (
    'seo-tr-neon-en', 'seo-neon-style', 'en',
    'Neon Style Themes',
    'Glow-forward Codex skins with cyber accents.',
    '## Neon style\n\nElectric palettes and glass chrome.',
    'reviewed', 1700000411000, 1700000411000
  ),
  (
    'seo-tr-neon-zh', 'seo-neon-style', 'zh-hans',
    '霓虹风格主题',
    '带有赛博点缀的发光 Codex 皮肤。',
    '## 霓虹风格\n\n电子色盘与玻璃质感。',
    'reviewed', 1700000411000, 1700000411000
  ),
  (
    'seo-tr-cozy-en', 'seo-cozy-mood', 'en',
    'Cozy Mood Themes',
    'Warm, soft Codex skins for comfortable sessions.',
    '## Cozy mood\n\nSoft surfaces and amber highlights.',
    'draft', 1700000412000, 1700000412000
  ),
  (
    'seo-tr-cozy-zh', 'seo-cozy-mood', 'zh-hans',
    '温馨氛围主题',
    '温暖柔和的 Codex 皮肤，适合舒适时段。',
    '## 温馨氛围\n\n柔软表面与琥珀色高光。',
    'draft', 1700000412000, 1700000412000
  )
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  body_markdown = excluded.body_markdown,
  translation_status = excluded.translation_status,
  updated_at = excluded.updated_at;
