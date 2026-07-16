# Codex Skin Store MVP Design

Date: 2026-07-16
Status: Approved product design, pending written-spec review

## 1. Product Definition

Codex Skin Store is a free, community-built marketplace for Codex Desktop themes. Visitors can browse, search, and preview themes without an account. Authentication is requested only when a visitor tries to download a theme package, copy its installation prompt, save it, comment, report content, or upload a theme.

The MVP validates one primary job: help a Codex user discover a theme they want and safely take the assets and instructions into Codex to install it. The web product does not install or inject themes on the user's machine.

### Core value exchange

- Consumers get a standardized theme package, a generated installation prompt, human-readable instructions, favorites, comments, and a personal library.
- Creators get free hosting, a public profile, theme distribution, download/favorite counts, comments, and basic management controls.
- The platform gets a growing set of structured, localizable theme assets that can support discovery and long-tail search pages.

### MVP scope

- Public theme marketplace, search, and controlled filters
- Theme detail pages with a simulated Codex Home/Task preview
- GitHub and Google OAuth
- Download and copy-prompt authentication gate with intent-preserving return
- Favorites, creator profiles, personal profile, and upload management
- Community upload and immediate publication after automated validation
- Theme comments and unified reporting
- Minimal moderation dashboard
- Standardized packages for macOS, Windows, or both
- English and Simplified Chinese public pages
- Programmatic SEO based on real theme and taxonomy data

### Explicit non-goals

- Paid themes, subscriptions, tips, or revenue sharing
- A local installer, browser extension, or automatic Codex injection
- Ratings, comment replies, comment likes, following, direct messages, or social feeds
- AI moderation or automatic copyright decisions
- Arbitrary user-supplied scripts, prompts, packages, or executable files
- Native mobile applications
- Complex recommendation or ranking models

## 2. Primary Journeys

### Consumer journey

1. A visitor opens the marketplace and filters by platform, appearance, animation, style, color, subject, or mood.
2. They open a theme and inspect it inside the simulated Codex shell, switching between Home and Task views.
3. They click Download package, Copy install prompt, or Favorite.
4. If anonymous, they authenticate with GitHub or Google.
5. After OAuth, they return to the same theme and the original action resumes.
6. They download the generated ZIP and/or copy the fixed-template prompt.
7. They can favorite the theme, comment on compatibility, or report a problem.

### Creator journey

1. A signed-in user opens Upload.
2. They upload one supported background asset and enter structured metadata.
3. They preview the theme in the simulated Codex shell and adjust focal point, mode, colors, and platform support.
4. They choose the asset's distribution license and accept the rights declaration.
5. The platform validates the asset and asynchronously generates preview, manifests, instructions, prompt, and ZIP.
6. When package generation succeeds, the creator confirms publication.
7. The theme becomes public immediately under the post-publication moderation policy.
8. The creator can edit metadata, publish a new version, unlist the theme, and moderate comments on their theme.

### Moderator journey

1. A moderator opens the report queue.
2. They inspect the target, reason, history, and reporter details.
3. They dismiss the report, hide/remove content, restore content, or suspend a user's upload permission.
4. Every moderation action is retained in an audit trail.

## 3. Information Architecture

### Public routes

- `/{locale}`: theme marketplace
- `/{locale}/themes/{slug}`: canonical theme detail
- `/{locale}/codex-themes/{dimension...}`: approved platform/taxonomy landing page
- `/{locale}/tags/{slug}`: approved taxonomy hub
- `/{locale}/creators/{handle}`: public creator profile and themes
- `/{locale}/about`, `/{locale}/terms`, `/{locale}/privacy`, `/{locale}/copyright`: trust and policy pages

Supported locales at launch are `en` and `zh-hans`. The unprefixed root performs language negotiation but is not a duplicate content page.

### Authenticated routes

- `/{locale}/me/favorites`
- `/{locale}/me/themes`
- `/{locale}/me/profile`
- `/{locale}/upload`
- `/{locale}/themes/{slug}/edit`

### Administrative routes

- `/{locale}/admin/reports`
- `/{locale}/admin/themes/{id}`
- `/{locale}/admin/users/{id}`
- `/{locale}/admin/seo-landings`

Authenticated and administrative pages are `noindex` and excluded from sitemaps.

## 4. Cloudflare Architecture

### Runtime and application

- Cloudflare Workers with Static Assets hosts the full application.
- React Router v7 framework mode provides SSR, route loaders/actions, and the React web UI.
- Worker APIs remain internal application services rather than a public versioned API in the MVP.
- Better Auth handles Google and GitHub OAuth, sessions, and account linking using D1.
- D1 stores relational application data.
- R2 stores original media, generated previews, platform adapters, and ZIP packages.
- Cloudflare Queues runs validation and package-generation jobs outside request latency.
- Cloudflare image transformations generate safe preview variants where supported; a deterministic fallback processor handles formats that cannot be transformed.
- Turnstile and Worker rate limits protect upload, comment, report, and authentication-sensitive endpoints.

### Component boundaries

- Marketplace service: public discovery queries, controlled filters, related themes, and popularity ordering.
- Theme service: theme lifecycle, versions, manifests, compatibility, and publish rules.
- Asset service: upload authorization, R2 keys, MIME/signature validation, transformation, and package generation.
- Identity service: OAuth, sessions, public profiles, roles, and upload status.
- Engagement service: favorites, comments, download/prompt-copy events, and counters.
- Moderation service: reports, content state changes, permissions, and audit records.
- SEO service: locale alternates, taxonomy registry, index eligibility, metadata, structured data, and sitemaps.

Each service exposes typed functions to route loaders/actions. Route components do not perform direct D1 or R2 operations.

### R2 object layout

Internal keys are immutable and ID-based:

```text
themes/{theme-id}/versions/{version}/source/background.{ext}
themes/{theme-id}/versions/{version}/generated/preview.jpg
themes/{theme-id}/versions/{version}/generated/manifest.json
themes/{theme-id}/versions/{version}/generated/adapters/macos/theme.json
themes/{theme-id}/versions/{version}/generated/adapters/windows/theme.json
themes/{theme-id}/versions/{version}/generated/install-prompt.md
themes/{theme-id}/versions/{version}/generated/INSTALL.md
themes/{theme-id}/versions/{version}/generated/theme.zip
```

Public media routes use localized alt text and a descriptive filename such as `neon-road-codex-theme-preview.jpg`; internal storage paths do not depend on mutable names.

## 5. Theme Package Contract

### Important compatibility rule

The macOS and Forge Windows `theme.json` schemas are different. A Windows theme manifest must not be copied into the macOS theme library, and the store must not claim one platform manifest is universal.

The store uses a neutral `manifest.json` as source data, then generates adapters only for the platforms selected and validated by the creator.

### Download layout

```text
codex-theme-{stable-slug}.zip
├── manifest.json
├── assets/
│   ├── background.{png|jpg|webp|gif}
│   └── preview.jpg
├── adapters/
│   ├── macos/theme.json      # when macOS is supported
│   └── windows/theme.json    # when Windows is supported
├── INSTALL.md
└── install-prompt.md
```

### Neutral manifest v1

The neutral manifest contains:

- `schemaVersion`, fixed to `1`
- Stable `id` and `slug`
- Localized name and description references
- Creator ID and public handle
- Asset license, attribution, and optional source URL
- Supported platforms: `macos`, `windows`, or both
- Compatibility targets: original macOS Dream Skin and/or Forge Windows
- Appearance mode: `light` or `dark`
- Media type: `static` or `animated`
- Accent, secondary, and highlight colors
- Normalized focal point `{x, y}`
- Asset filenames, MIME types, byte sizes, dimensions, and SHA-256 hashes
- Theme version and generated timestamp

### Public upload input

For safety, public upload accepts exactly one image/media asset plus structured form fields. It does not accept ZIP files, JSON, Markdown, scripts, or user-written install prompts. JSON, Markdown, adapters, and ZIP files in the download are generated by the platform.

Supported source formats:

- PNG, JPEG, and WebP for both platforms
- GIF only when the creator selects Windows animated support
- HEIC and TIFF are not accepted in the MVP web uploader; creators convert them to PNG, JPEG, or WebP before upload

Initial limits:

- Source file: 25 MB maximum
- Prepared background: 16 MB maximum
- Preview JPEG: 250 KB target
- Pixel count and decoded dimensions are capped to prevent decompression bombs
- No SVG, HTML, video, nested archive, executable, or active content

### Installation prompt

The prompt is rendered from a versioned, platform-owned template. Uploaders cannot edit it. It includes theme ID/version, package hash, selected platform, compatibility target, and safe instructions to:

1. Detect the operating system.
2. Confirm official Codex Desktop and a supported Dream Skin runtime exist.
3. Stop if the expected runtime is absent and explain the prerequisite.
4. Back up the current theme state.
5. Verify the package files and SHA-256 hashes.
6. Copy only the generated assets and adapter for the detected platform.
7. Apply and verify the theme using the supported Dream Skin command.
8. Report exact results and stop on any failed precondition.

It explicitly forbids modifying official `.app`, `app.asar`, WindowsApps, signatures, API keys, Base URLs, model providers, or unrelated Codex configuration.

## 6. Data Model

D1 migrations define at least these tables:

- `users`: identity-independent profile, handle, display name, avatar, bio, role, upload status, timestamps
- Better Auth tables: accounts, sessions, verifications, and linked OAuth identities
- `themes`: stable identity, author, slug, source locale, current version, visibility, moderation status, package status, aggregate counters, timestamps
- `theme_versions`: version number, neutral manifest, asset keys/hashes, generation state/error, published timestamp
- `theme_translations`: theme, locale, name, description, SEO title/description, translation status
- `taxonomies`: stable key, dimension, slug, active state
- `taxonomy_translations`: taxonomy, locale, display name, description
- `theme_taxonomies`: theme-to-taxonomy relation
- `favorites`: user, theme, created timestamp; unique on user/theme
- `comments`: theme, user, body, status, timestamps; no parent ID in MVP
- `reports`: reporter, target type/ID, reason, details, status, resolution fields
- `moderation_actions`: actor, target, action, reason, before/after state, timestamp
- `engagement_events`: user when available, theme, version, event type, platform, timestamp
- `seo_landings`: registered dimension combination, slug/path, index status, eligibility metrics
- `seo_landing_translations`: locale, title, introduction, FAQ, metadata, review status

`engagement_events` includes `download`, `prompt_copy`, and relevant conversion events. Raw events are not shown as download history in the MVP.

### State axes

Theme state is represented by independent fields:

- Visibility: `draft`, `public`, `unlisted`, `hidden`
- Moderation: `clean`, `flagged`, `removed`
- Package: `processing`, `ready`, `failed`

A theme is publicly downloadable only when visibility is `public`, moderation is not `removed`, and the current package is `ready`.

Comment state is `visible`, `hidden_by_author`, `removed_by_admin`, or `deleted_by_user`. Hidden and deleted bodies are not rendered publicly; moderation records remain auditable.

### Stable identity and deletion

- The stable ASCII theme slug is suggested from a concise English name, editable before first publication, normalized to lowercase hyphens, collision-checked, and immutable after publication.
- Display names and translations may change without changing URLs.
- Account deletion removes OAuth/session data and favorites, anonymizes retained comments and aggregate events, and moves owned themes to `unlisted` pending export or moderation review.
- A creator cannot erase aggregate or moderation records by editing or unlisting a theme.

## 7. Comments and Moderation

Theme pages display public comments newest first. Visitors can read comments; authenticated users can post, delete their own comment, or report a comment.

MVP comment controls:

- Plain text only, with a defined length limit
- No replies, likes, rich text, links rendered as active HTML, attachments, or ranking
- Server-side normalization and HTML escaping
- Per-user and per-IP rate limits
- Theme authors can hide comments on their own themes; administrators can restore or remove them
- All author and administrator moderation actions are audited

Reports support theme, comment, and user targets with controlled reason codes plus optional details. Reports do not automatically hide content. Administrators can dismiss, remove, restore, or restrict upload permission.

Uploads require a rights declaration and an explicit distribution license. Supported launch licenses are CC0-1.0, CC-BY-4.0, and a clearly labeled personal-use-only grant that still permits free redistribution through the store. Themes without a valid redistribution grant cannot be published. The site provides a copyright/takedown process and preserves evidence needed to process claims.

## 8. SEO and Programmatic i18n

### Locale model

- Launch locales: `en` and `zh-hans`
- Every indexable page has a locale-prefixed canonical URL
- Each translation set emits a self-reference, reciprocal alternate links, and `x-default` pointing to English
- HTML `lang`, localized metadata, Open Graph data, image alt text, dates, and UI copy match the locale
- A locale page is not indexed until required content is complete and reviewed

A theme has one source locale. Other locale content may be created as a machine-assisted draft, but it remains `noindex` until the creator or an administrator approves it. Structured facts such as platform and media type use deterministic taxonomy translations rather than generated prose.

### Controlled taxonomy

Launch dimensions are:

- Platform
- Appearance mode
- Media type
- Style
- Dominant color
- Subject
- Mood
- Compatibility target

Uploaders choose from controlled values and may suggest a missing value for moderation. Synonyms map to one canonical taxonomy key; for example, `sci fi`, `sci-fi`, and localized equivalents map to `science-fiction`. Taxonomy keys and slugs are stable ASCII; display labels are localized.

### Indexable page registry

The application does not expose every filter combination as an indexable URL. `seo_landings` is an allowlist of approved pages. A candidate landing page becomes eligible only when it has:

- At least six public, ready themes
- At least three distinct creators
- A reviewed localized introduction and useful FAQ or selection guidance
- Related collection links and breadcrumb context
- At least 30-40% genuinely unique main content relative to sibling landing pages
- Complete target-locale content

Search results, query-string filters, pagination beyond the intended canonical entry, empty combinations, thin tags, authenticated pages, and administrative pages are `noindex` and excluded from sitemaps.

Programmatic pages roll out in batches of 50-100. Index coverage, impressions, crawl behavior, and duplicate/thin-content signals are reviewed for two to four weeks before expanding.

### Theme page value

Every public theme page exposes server-rendered, theme-specific data:

- Real preview media and simulated Codex views
- Platform, mode, animation, compatibility, dimensions, and package version
- Palette and focal point
- Creator description and license/attribution
- Package contents and safe installation overview
- Version history
- Public compatibility comments
- Related themes selected from real shared attributes

This content must stand alone without relying on keyword-swapped boilerplate. The exact generated install prompt and package remain authentication-gated; crawlable pages retain sufficient public compatibility and installation overview content.

### Metadata and structured data

- Theme page: `CreativeWork`, `Person`, `Comment` for visible comments, and `BreadcrumbList`
- Collection page: `ItemList` and `BreadcrumbList`
- No rating schema until the product has a real rating feature
- Self-referencing canonical on every indexable page
- Dynamic locale-aware XML sitemaps; `lastmod` reflects actual content updates
- `robots.txt` references the sitemap index and blocks no public asset needed for rendering

## 9. Ranking, Search, and Internal Links

The MVP marketplace default is a transparent trend score based on recent unique downloads, favorites, and freshness, with anti-abuse caps. Exact weights are configuration, not part of the public contract. Users can switch to newest and most downloaded.

Search covers localized theme names/descriptions, creator handles, and controlled taxonomy labels. D1-backed search is sufficient for MVP scale; a dedicated search service is deferred until measured need.

Each theme page links to its creator, platform, compatibility, and two to five related themes. Each approved landing page links to child themes, parent taxonomy hubs, and related collections. Breadcrumbs reflect the canonical indexable hierarchy rather than the user's transient filter state.

## 10. Error Handling and Safety

- OAuth failures return to the theme with a clear retry action and preserve the intended operation in a short-lived signed state value.
- Uploads use short-lived R2 authorization, content-length constraints, and a draft-bound object key.
- A failed upload or generation job remains a private draft with a specific recoverable error; no partial theme becomes public.
- Queue jobs are idempotent by theme/version and safe to retry.
- Publishing uses one atomic D1 batch: a conditional theme update succeeds only when the current version is still `ready`; otherwise the batch fails without exposing the theme.
- Download URLs are short-lived and issued only after authorization and state checks.
- Favorite endpoints are idempotent.
- Counters are derived from accepted events and periodically reconciled; counter failure never blocks the user's download.
- User-facing errors avoid exposing R2 keys, SQL details, OAuth tokens, or internal stack traces.
- Media is served with correct content types, restrictive content disposition where needed, and `X-Content-Type-Options: nosniff`.
- Administrative actions require server-side roles; hiding UI is never treated as authorization.

## 11. Analytics and MVP Success

The north-star metric is weekly successful theme deliveries: distinct signed-in user/theme pairs that complete a package download or prompt copy.

Supporting metrics:

- Theme detail to authentication-start rate
- OAuth start to completion rate
- Authentication completion to delivery rate
- Package download versus prompt-copy mix
- Seven-day favorite return rate
- Number of public, ready themes
- Percentage of themes uploaded by non-admin users
- Upload-to-ready success rate and processing latency
- Comment/report rate per 100 deliveries
- Valid indexed theme pages and non-brand long-tail impressions

Provisional first-30-day validation targets, to be revised after baseline data:

- At least 30 public, ready themes, including seeded inventory
- At least 10 public themes from non-admin creators
- At least 60% OAuth completion after a download intent
- At least 70% delivery completion after successful OAuth
- At least 95% package-generation success for supported inputs
- No executable or user-authored prompt files in downloadable packages

## 12. Release Priorities

### P0 launch

- SSR marketplace, controlled filters, and theme detail
- Codex Home/Task simulated preview
- Google and GitHub OAuth with intent return
- Package download, prompt copy, favorites, profiles, and creator pages
- Safe upload, processing queue, generated adapters/package/prompt, and publication
- First-level comments, reporting, and minimal moderation
- English and Simplified Chinese routing and UI
- Controlled taxonomy, index registry, metadata, canonical, hreflang, JSON-LD, and sitemaps
- Terms, privacy, license/rights declaration, and copyright report path

### P1 after validation

- Creator draft previews and richer version history
- Better compatibility feedback fields in comments
- Curated collections and featured creators
- Translation review workflow improvements
- Theme quality signals and personalized recommendations
- Optional supported local installer integration

## 13. Testing and Acceptance

### Automated coverage

- Unit tests for slug normalization, taxonomy synonym mapping, manifests, adapters, prompt rendering, eligibility rules, trend scoring, and permission policies
- D1 integration tests for OAuth account linking, state transitions, favorites, comments, reports, deletion/anonymization, and atomic publication batches
- Asset pipeline tests with valid files, spoofed MIME, oversized dimensions, decompression bombs, unsupported animation, retry, and duplicate jobs
- Route tests for anonymous/authenticated behavior and OAuth intent return
- SEO tests for SSR content, canonical, self/return hreflang, `x-default`, localized metadata, structured data validity, noindex rules, and sitemap inclusion
- Package snapshot/schema tests for macOS-only, Windows-only, and dual-platform themes
- End-to-end tests for browse-preview-login-deliver, favorite, upload-publish, comment-report, and moderator removal/restore

### Release acceptance

- Public pages expose useful core content in server HTML and remain understandable with JavaScript disabled
- OAuth returns to the original theme and completes or restores the original action
- Public upload cannot introduce executable code, user-authored prompts, nested archives, or active markup
- Generated packages pass schema and hash validation for every declared platform
- Failed processing is private, retryable, and does not create a downloadable partial version
- Visibility, moderation, and package state changes cannot bypass authorization
- Canonical, hreflang, structured data, robots, and sitemap tests pass for both launch locales
- Thin or incomplete taxonomy combinations are not indexable
- Desktop and mobile layouts have no overlapping preview, text, comment, or action controls
- Keyboard navigation, visible focus, labels, and contrast meet WCAG 2.2 AA for core flows

## 14. Key Product Risks

- Copyright/IP risk: mitigate with explicit redistribution licenses, rights declaration, reporting, takedown workflow, and moderation audit.
- Prompt/package trust risk: generate all executable instructions from fixed templates and never accept uploader code or prompts.
- Compatibility drift: version adapters and compatibility targets independently from store metadata; test against supported Dream Skin releases.
- Thin-content/index bloat: use controlled taxonomies, an index allowlist, quality thresholds, reviewed translations, and staged rollout.
- Cold-start marketplace: seed a high-quality initial catalog while tracking the proportion of non-admin uploads.
- Comment abuse: plain text, rate limits, Turnstile where necessary, author controls, reports, and administrator audit.
- Cloudflare coupling: keep manifest format, domain services, and data contracts independent of D1/R2 bindings so storage adapters can be replaced later.
