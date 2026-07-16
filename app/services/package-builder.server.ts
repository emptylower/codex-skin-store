import {
  MAX_SOURCE_BYTES,
  MediaError,
  type MediaInspection,
  type PreparedStaticMedia,
} from "~/domain/assets/media-types";
import { inspectMedia } from "~/domain/assets/media-policy";
import {
  parseCreatorInput,
  type CreatorInput,
} from "~/domain/themes/creator-input";
import {
  resolveEmitPlatforms,
  type Platform,
} from "~/domain/themes/compatibility";
import { buildMacosAdapter } from "~/domain/themes/adapters/macos-v1";
import { buildWindowsAdapter } from "~/domain/themes/adapters/windows-v1";
import {
  buildManifest,
  serializeManifest,
  type ManifestAsset,
} from "~/domain/themes/manifest-v1";
import {
  renderInstallMarkdown,
  renderInstallPrompt,
} from "~/domain/themes/install-prompt-v1";
import {
  payloadDigest,
  sha256Hex,
  type ArtifactEntry,
} from "~/domain/themes/package-inventory";
import {
  prepareStaticMedia,
  type PrepareStaticMediaDeps,
} from "~/platform/cloudflare/images.server";
import type { ReencodeLargeSource } from "~/platform/cloudflare/photon.server";
import {
  PackageError,
  checkStoredPackage,
  putImmutableArtifact,
  writeAndPromoteZip,
} from "~/platform/cloudflare/r2-packages.server";
import type { SourceObjectStore } from "~/platform/ports";

export { PackageError, checkStoredPackage };

export type LeasedJob = {
  themeId: string;
  version: number;
  jobId?: string;
};

export type BuilderDeps = {
  db: D1Database;
  sources: SourceObjectStore;
  packages: R2Bucket;
  images: ImagesBinding;
  reencodeLargeSource?: ReencodeLargeSource | null;
  enableGif?: boolean;
  jobId?: string;
  zipFlag?: string | null;
  prepareStatic?: (
    deps: PrepareStaticMediaDeps,
    bytes: Uint8Array,
    inspection: MediaInspection,
    options: { focal: { x: number; y: number } },
  ) => Promise<PreparedStaticMedia>;
};

export type BuildPackageResult = {
  generationState: "ready";
  packageKey: string;
  payloadDigest: string;
  archiveDigest: string;
  archiveBytes: number;
};

export type VersionBuildRow = {
  id: string;
  theme_id: string;
  version: number;
  generation_state: string;
  creator_input_json: string | null;
  created_at: number;
  quarantine_key: string | null;
  source_key: string | null;
  package_key: string | null;
  payload_digest: string | null;
  archive_digest: string | null;
  archive_bytes: number | null;
  preview_key: string | null;
  preview_bytes: number | null;
  preview_sha256: string | null;
  manifest_key: string | null;
  macos_adapter_key: string | null;
  windows_adapter_key: string | null;
  install_key: string | null;
  prompt_key: string | null;
  source_sha256: string | null;
  source_mime: string | null;
  source_bytes: number | null;
  source_width: number | null;
  source_height: number | null;
  source_filename: string | null;
  author_id: string;
  author_handle: string;
  slug: string;
  source_locale: string;
  current_version: number | null;
};

function versionBase(themeId: string, version: number): string {
  return `themes/${themeId}/versions/${version}`;
}

export function generatedKey(
  themeId: string,
  version: number,
  relative: string,
): string {
  return `${versionBase(themeId, version)}/generated/${relative}`;
}

export function sourceKeyFor(
  themeId: string,
  version: number,
  extension: string,
): string {
  return `${versionBase(themeId, version)}/source/background.${extension}`;
}

/**
 * Enforce that inspected media matches creator-declared mediaType / GIF policy.
 */
export function enforceDeclaredMedia(
  inspected: MediaInspection,
  input: CreatorInput,
  enableGif: boolean,
): void {
  if (inspected.mediaType !== input.mediaType) {
    throw new PackageError(
      "media_type_mismatch",
      false,
      `declared=${input.mediaType} actual=${inspected.mediaType}`,
    );
  }
  if (inspected.mediaType === "animated") {
    if (!enableGif) {
      throw new PackageError("gif_disabled", false, "animated_gif_not_enabled");
    }
    if (
      input.platforms.length !== 1 ||
      input.platforms[0] !== "windows" ||
      inspected.mime !== "image/gif"
    ) {
      throw new PackageError(
        "animated_policy_violation",
        false,
        "animated_requires_windows_gif",
      );
    }
  } else if (inspected.mime === "image/gif") {
    throw new PackageError("gif_disabled", false, "static_gif_not_supported");
  }
}

async function loadOwnedVersion(
  db: D1Database,
  themeId: string,
  version: number,
): Promise<VersionBuildRow> {
  const row = await db
    .prepare(
      `SELECT
         v.id AS id,
         v.theme_id AS theme_id,
         v.version AS version,
         v.generation_state AS generation_state,
         v.creator_input_json AS creator_input_json,
         v.created_at AS created_at,
         v.source_key AS source_key,
         v.package_key AS package_key,
         v.payload_digest AS payload_digest,
         v.archive_digest AS archive_digest,
         v.archive_bytes AS archive_bytes,
         v.preview_key AS preview_key,
         v.preview_bytes AS preview_bytes,
         v.preview_sha256 AS preview_sha256,
         v.manifest_key AS manifest_key,
         v.macos_adapter_key AS macos_adapter_key,
         v.windows_adapter_key AS windows_adapter_key,
         v.install_key AS install_key,
         v.prompt_key AS prompt_key,
         v.source_sha256 AS source_sha256,
         v.source_mime AS source_mime,
         v.source_bytes AS source_bytes,
         v.source_width AS source_width,
         v.source_height AS source_height,
         v.source_filename AS source_filename,
         u.quarantine_key AS quarantine_key,
         t.author_id AS author_id,
         t.slug AS slug,
         t.source_locale AS source_locale,
         t.current_version AS current_version,
         users.handle AS author_handle
       FROM theme_versions v
       INNER JOIN themes t ON t.id = v.theme_id
       INNER JOIN users ON users.id = t.author_id
       LEFT JOIN source_uploads u
         ON u.theme_id = v.theme_id AND u.version = v.version
       WHERE v.theme_id = ? AND v.version = ?`,
    )
    .bind(themeId, version)
    .first<VersionBuildRow>();

  if (!row) {
    throw new PackageError("version_not_found", false);
  }
  return row;
}

async function readBoundedSource(
  sources: SourceObjectStore,
  key: string,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!sources.get) {
    throw new PackageError("sources_get_unavailable", true);
  }
  const head = await sources.head(key);
  if (!head) {
    throw new PackageError("source_missing", true, key);
  }
  if (head.size > maxBytes || head.size < 1) {
    throw new PackageError(
      head.size > maxBytes ? "source_too_large" : "source_empty",
      false,
    );
  }
  const bytes = await sources.get(key);
  if (!bytes) {
    throw new PackageError("source_missing", true, key);
  }
  if (bytes.byteLength !== head.size) {
    throw new PackageError("source_size_mismatch", true);
  }
  if (bytes.byteLength > maxBytes) {
    throw new PackageError("source_too_large", false);
  }
  return bytes;
}

type PreparedMedia = PreparedStaticMedia;

async function prepareGifMedia(
  _deps: BuilderDeps,
  _bytes: Uint8Array,
  _inspected: MediaInspection,
): Promise<PreparedMedia> {
  throw new PackageError("gif_disabled", false, "prepare_gif_not_implemented");
}

/** Deterministic runtime palette derived from creator colors + appearance. */
export function deriveAdapterPalette(input: CreatorInput) {
  const dark = input.appearance === "dark";
  const accentRgb = hexToRgbString(input.accent);
  const text = dark ? "#F5F5FF" : "#111122";
  const textRgb = hexToRgbString(text);
  const canvas = dark ? "#050510" : "#F7F7FB";
  const surface = dark ? "#12122A" : "#FFFFFF";
  const surfaceAlt = dark ? "#1A1A34" : "#EEF0F8";

  return {
    canvas,
    surface,
    surfaceAlt,
    surfaceSolid: surface,
    elevated: dark ? "#1E1E3A" : "#FFFFFF",
    control: dark ? "#2A2A4A" : "#E8EAF4",
    mainSurface: dark ? "#0E0E20" : "#F0F2FA",
    sidebar: dark ? "#0A0A18" : "#EBEDF6",
    text,
    textRgb,
    muted: dark ? "#8899AA" : "#667788",
    line: dark ? "#334455" : "#CCD0E0",
    heavyLine: dark ? "#556677" : "#AAB0C4",
    grid: dark ? "#223344" : "#DDE1F0",
    codeBackground: dark ? "#080812" : "#F2F4FC",
    buttonText: dark ? "#FFFFFF" : "#111122",
    accentStrong: lightenHex(input.accent, 0.15),
    accentSoft: lightenHex(input.accent, 0.4),
    accentFaint: lightenHex(input.accent, 0.65),
    accentRgb,
    backgroundPosition: `center ${Math.round(input.focalPoint.y * 100)}%`,
    heroOverlay: dark ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.20)",
    pageOverlay: dark ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.15)",
    homeOverlay: dark ? "rgba(0,0,0,0.40)" : "rgba(255,255,255,0.25)",
    titleShadow: dark
      ? "0 2px 12px rgba(0,0,0,0.6)"
      : "0 1px 4px rgba(0,0,0,0.12)",
  };
}

function hexToRgbString(hex: string): string {
  const n = parseHex(hex);
  return `${n.r}, ${n.g}, ${n.b}`;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
  };
}

function lightenHex(hex: string, amount: number): string {
  const { r, g, b } = parseHex(hex);
  const mix = (c: number) => Math.min(255, Math.round(c + (255 - c) * amount));
  return `#${[mix(r), mix(g), mix(b)]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function textArtifact(path: string, text: string): ArtifactEntry {
  const bytes = new TextEncoder().encode(text);
  return { path, size: bytes.byteLength, bytes };
}

function binaryArtifact(path: string, bytes: Uint8Array): ArtifactEntry {
  return { path, size: bytes.byteLength, bytes };
}

/**
 * Media + manifest + selected adapters (no INSTALL / install-prompt).
 */
async function renderBaseArtifacts(
  row: VersionBuildRow,
  media: PreparedMedia,
  generatedAt: string,
  input: CreatorInput,
): Promise<ArtifactEntry[]> {
  const bgFilename = `background.${media.background.extension}`;
  const bgSha = await sha256Hex(media.background.bytes);
  const previewSha = await sha256Hex(media.preview.bytes);

  const backgroundAsset: ManifestAsset = {
    filename: bgFilename,
    mime: media.background.mime,
    bytes: media.background.bytes.byteLength,
    width: media.background.width,
    height: media.background.height,
    sha256: bgSha,
  };
  const previewAsset: ManifestAsset = {
    filename: "preview.jpg",
    mime: "image/jpeg",
    bytes: media.preview.bytes.byteLength,
    width: 1600,
    height: 1000,
    sha256: previewSha,
  };

  const mediaType = input.mediaType;
  const platforms = resolveEmitPlatforms({
    platforms: input.platforms,
    mediaType,
  });

  const manifest = buildManifest({
    id: row.theme_id,
    slug: row.slug,
    version: row.version,
    sourceLocale: input.sourceLocale,
    name: input.name,
    description: input.description,
    creator: { id: row.author_id, handle: row.author_handle },
    license: input.license,
    attribution: input.attribution,
    sourceUrl: input.sourceUrl,
    platforms: input.platforms,
    appearance: input.appearance,
    mediaType,
    accent: input.accent,
    secondary: input.secondary,
    highlight: input.highlight,
    focalPoint: input.focalPoint,
    assets: { background: backgroundAsset, preview: previewAsset },
    generatedAt,
  });

  const artifacts: ArtifactEntry[] = [
    binaryArtifact(bgFilename, media.background.bytes),
    binaryArtifact("preview.jpg", media.preview.bytes),
    textArtifact("manifest.json", serializeManifest(manifest)),
  ];

  const palette = deriveAdapterPalette(input);

  if (platforms.includes("macos")) {
    const mac = buildMacosAdapter({
      slug: row.slug,
      name: input.name,
      description: input.description,
      backgroundFilename: bgFilename,
      canvas: palette.canvas,
      surface: palette.surface,
      surfaceAlt: palette.surfaceAlt,
      accent: input.accent,
      highlight: input.highlight,
      secondary: input.secondary,
      accentStrong: palette.accentStrong,
      text: palette.text,
      muted: palette.muted,
      line: palette.line,
    });
    artifacts.push(
      textArtifact("adapters/macos/theme.json", `${JSON.stringify(mac)}\n`),
    );
  }

  if (platforms.includes("windows")) {
    const win = buildWindowsAdapter({
      slug: row.slug,
      name: input.name,
      description: input.description,
      backgroundFilename: bgFilename,
      appearance: input.appearance,
      accent: input.accent,
      accentStrong: palette.accentStrong,
      accentSoft: palette.accentSoft,
      accentFaint: palette.accentFaint,
      accentRgb: palette.accentRgb,
      highlight: input.highlight,
      secondary: input.secondary,
      text: palette.text,
      textRgb: palette.textRgb,
      muted: palette.muted,
      canvas: palette.canvas,
      sidebar: palette.sidebar,
      surface: palette.surface,
      surfaceSolid: palette.surfaceSolid,
      elevated: palette.elevated,
      control: palette.control,
      mainSurface: palette.mainSurface,
      line: palette.line,
      heavyLine: palette.heavyLine,
      grid: palette.grid,
      codeBackground: palette.codeBackground,
      buttonText: palette.buttonText,
      backgroundPosition: palette.backgroundPosition,
      heroOverlay: palette.heroOverlay,
      pageOverlay: palette.pageOverlay,
      homeOverlay: palette.homeOverlay,
      titleShadow: palette.titleShadow,
    });
    artifacts.push(
      textArtifact("adapters/windows/theme.json", `${JSON.stringify(win)}\n`),
    );
  }

  return artifacts;
}

/**
 * INSTALL embeds baseDigest (hash of media/manifest/adapters only) to avoid
 * circular payload hashing. install-prompt embeds the final payloadDigest
 * (which includes INSTALL.md and excludes the prompt itself).
 */
async function assemblePackageArtifacts(
  row: VersionBuildRow,
  media: PreparedMedia,
  generatedAt: string,
  input: CreatorInput,
): Promise<{ artifacts: ArtifactEntry[]; digest: string }> {
  const base = await renderBaseArtifacts(row, media, generatedAt, input);
  const baseDigest = await payloadDigest(base);

  const fileHashesBase = await Promise.all(
    base.map(async (a) => ({
      path: a.path,
      sha256: await sha256Hex(a.bytes),
    })),
  );

  const install = textArtifact(
    "INSTALL.md",
    renderInstallMarkdown({
      themeId: row.theme_id,
      version: row.version,
      name: input.name,
      attribution: input.attribution,
      platforms: input.platforms as Platform[],
      mediaType: input.mediaType,
      payloadDigest: baseDigest,
      fileHashes: fileHashesBase,
    }),
  );

  const withInstall = [...base, install];
  const finalDigest = await payloadDigest(withInstall);

  const fileHashesForPrompt = await Promise.all(
    withInstall.map(async (a) => ({
      path: a.path,
      sha256: await sha256Hex(a.bytes),
    })),
  );

  const prompt = textArtifact(
    "install-prompt.md",
    renderInstallPrompt({
      themeId: row.theme_id,
      version: row.version,
      name: input.name,
      attribution: input.attribution,
      platforms: input.platforms as Platform[],
      mediaType: input.mediaType,
      payloadDigest: finalDigest,
      fileHashes: fileHashesForPrompt,
    }),
  );

  const artifacts = [...withInstall, prompt];
  // Confirm prompt exclusion keeps digest stable.
  const confirmed = await payloadDigest(artifacts);
  if (confirmed !== finalDigest) {
    throw new PackageError("payload_digest_unstable", false);
  }
  return { artifacts, digest: finalDigest };
}

async function verifyReadyArtifacts(
  deps: BuilderDeps,
  row: VersionBuildRow,
): Promise<BuildPackageResult> {
  if (
    !row.package_key ||
    !row.payload_digest ||
    !row.archive_digest ||
    row.archive_bytes == null
  ) {
    throw new PackageError("ready_incomplete", false);
  }
  const checked = await checkStoredPackage(deps.packages, row.package_key);
  if (
    checked.payloadDigest !== row.payload_digest ||
    checked.archiveDigest !== row.archive_digest
  ) {
    throw new PackageError("ready_digest_mismatch", false);
  }
  return {
    generationState: "ready",
    packageKey: row.package_key,
    payloadDigest: row.payload_digest,
    archiveDigest: row.archive_digest,
    archiveBytes: row.archive_bytes,
  };
}

async function writeVerifyZipAndMarkReady(
  deps: BuilderDeps,
  row: VersionBuildRow,
  artifacts: ArtifactEntry[],
  digest: string,
  generatedAtIso: string,
  media: PreparedMedia,
  sourceSha: string,
  finalSourceKey: string,
  input: CreatorInput,
): Promise<BuildPackageResult> {
  const themeId = row.theme_id;
  const version = row.version;
  const jobId = deps.jobId ?? `job-${themeId}-${version}`;

  const contentTypes: Record<string, string> = {
    "preview.jpg": "image/jpeg",
    "manifest.json": "application/json",
    "adapters/macos/theme.json": "application/json",
    "adapters/windows/theme.json": "application/json",
    "install-prompt.md": "text/markdown; charset=utf-8",
    "INSTALL.md": "text/markdown; charset=utf-8",
  };

  const keyByPath = new Map<string, string>();
  const shaByPath = new Map<string, string>();
  const sizeByPath = new Map<string, number>();

  for (const artifact of artifacts) {
    // Background is stored in SOURCES + ZIP only (not a separate PACKAGES object).
    if (artifact.path.startsWith("background.")) {
      shaByPath.set(artifact.path, await sha256Hex(artifact.bytes));
      sizeByPath.set(artifact.path, artifact.size);
      continue;
    }
    const key = generatedKey(themeId, version, artifact.path);
    const put = await putImmutableArtifact(deps.packages, key, artifact.bytes, {
      contentType: contentTypes[artifact.path] ?? "application/octet-stream",
    });
    keyByPath.set(artifact.path, key);
    shaByPath.set(artifact.path, put.sha256);
    sizeByPath.set(artifact.path, put.size);
  }

  const packageKey = generatedKey(themeId, version, "theme.zip");
  const zipResult = await writeAndPromoteZip({
    bucket: deps.packages,
    jobId,
    finalKey: packageKey,
    artifacts,
    payloadDigest: digest,
    generatedAt: new Date(generatedAtIso),
    zipFlag: deps.zipFlag,
  });

  for (const [path, key] of keyByPath) {
    const head = await deps.packages.head(key);
    if (
      !head ||
      head.size !== sizeByPath.get(path) ||
      head.customMetadata?.sha256 !== shaByPath.get(path)
    ) {
      throw new PackageError("artifact_verification_failed", true, path);
    }
  }
  await checkStoredPackage(deps.packages, packageKey);

  const platforms = resolveEmitPlatforms({
    platforms: input.platforms,
    mediaType: input.mediaType,
  });
  const now = Date.now();
  const generatedAtMs = Date.parse(generatedAtIso);

  const manifestJson = new TextDecoder().decode(
    artifacts.find((a) => a.path === "manifest.json")!.bytes,
  );

  const versionUpdate = await deps.db
    .prepare(
      `UPDATE theme_versions
       SET generation_state = 'ready',
           manifest_json = ?,
           package_key = ?,
           payload_digest = ?,
           archive_digest = ?,
           archive_bytes = ?,
           source_key = ?,
           source_filename = ?,
           source_mime = ?,
           source_bytes = ?,
           source_width = ?,
           source_height = ?,
           source_sha256 = ?,
           preview_key = ?,
           preview_bytes = ?,
           preview_sha256 = ?,
           manifest_key = ?,
           macos_adapter_key = ?,
           windows_adapter_key = ?,
           install_key = ?,
           prompt_key = ?,
           generated_at = ?,
           generation_error_code = NULL,
           generation_error_detail = NULL,
           updated_at = ?
       WHERE theme_id = ? AND version = ?
         AND generation_state IN ('queued', 'processing', 'failed')`,
    )
    .bind(
      manifestJson,
      packageKey,
      digest,
      zipResult.archiveDigest,
      zipResult.archiveBytes,
      finalSourceKey,
      `background.${media.background.extension}`,
      media.background.mime,
      media.background.bytes.byteLength,
      media.background.width,
      media.background.height,
      sourceSha,
      keyByPath.get("preview.jpg") ?? null,
      sizeByPath.get("preview.jpg") ?? null,
      shaByPath.get("preview.jpg") ?? null,
      keyByPath.get("manifest.json") ?? null,
      platforms.includes("macos")
        ? (keyByPath.get("adapters/macos/theme.json") ?? null)
        : null,
      platforms.includes("windows")
        ? (keyByPath.get("adapters/windows/theme.json") ?? null)
        : null,
      keyByPath.get("INSTALL.md") ?? null,
      keyByPath.get("install-prompt.md") ?? null,
      Number.isFinite(generatedAtMs) ? generatedAtMs : now,
      now,
      themeId,
      version,
    )
    .run();

  if (versionUpdate.meta.changes !== 1) {
    const reloaded = await loadOwnedVersion(deps.db, themeId, version);
    if (reloaded.generation_state === "ready") {
      return verifyReadyArtifacts(deps, reloaded);
    }
    throw new PackageError("ready_transition_failed", true);
  }

  // Theme package_status ready only when this version is the current pointer.
  await deps.db
    .prepare(
      `UPDATE themes
       SET package_status = 'ready',
           updated_at = ?
       WHERE id = ?
         AND current_version = ?`,
    )
    .bind(now, themeId, version)
    .run();

  return {
    generationState: "ready",
    packageKey,
    payloadDigest: digest,
    archiveDigest: zipResult.archiveDigest,
    archiveBytes: zipResult.archiveBytes,
  };
}

/**
 * Idempotent package builder: quarantine → prepare → artifacts → ZIP → ready.
 */
export async function buildPackageVersion(
  deps: BuilderDeps,
  job: LeasedJob,
): Promise<BuildPackageResult> {
  if (job.jobId) {
    deps = { ...deps, jobId: job.jobId };
  }

  const row = await loadOwnedVersion(deps.db, job.themeId, job.version);
  if (row.generation_state === "ready") {
    return verifyReadyArtifacts(deps, row);
  }

  if (!row.creator_input_json) {
    throw new PackageError("missing_creator_input", false);
  }
  let input: CreatorInput;
  try {
    input = parseCreatorInput(JSON.parse(row.creator_input_json));
  } catch (err) {
    throw new PackageError(
      "invalid_creator_input",
      false,
      err instanceof Error ? err.message : "parse_failed",
    );
  }

  const quarantineKey = row.quarantine_key ?? row.source_key;
  if (!quarantineKey) {
    throw new PackageError("missing_source", false);
  }

  const bytes = await readBoundedSource(
    deps.sources,
    quarantineKey,
    MAX_SOURCE_BYTES,
  );

  let inspected: MediaInspection;
  try {
    inspected = inspectMedia(bytes, bytes.length);
  } catch (err) {
    if (err instanceof MediaError) {
      throw new PackageError(err.code, false, err.message);
    }
    throw err;
  }

  enforceDeclaredMedia(inspected, input, deps.enableGif === true);

  const prepareDeps: PrepareStaticMediaDeps = {
    images: deps.images,
    reencodeLargeSource: deps.reencodeLargeSource ?? null,
  };
  const prepare =
    deps.prepareStatic ?? ((d, b, i, o) => prepareStaticMedia(d, b, i, o));

  let media: PreparedMedia;
  try {
    media =
      inspected.mediaType === "static"
        ? await prepare(prepareDeps, bytes, inspected, {
            focal: input.focalPoint,
          })
        : await prepareGifMedia(deps, bytes, inspected);
  } catch (err) {
    if (err instanceof MediaError) {
      throw new PackageError(err.code, false, err.message);
    }
    if (err instanceof PackageError) throw err;
    throw new PackageError(
      "prepare_failed",
      true,
      err instanceof Error ? err.message : "prepare_failed",
    );
  }

  const sourceSha = await sha256Hex(media.background.bytes);
  const generatedAt = new Date(row.created_at).toISOString();
  const finalSourceKey = sourceKeyFor(
    row.theme_id,
    row.version,
    media.background.extension,
  );

  if (deps.sources.moveQuarantineToSource) {
    await deps.sources.moveQuarantineToSource({
      quarantineKey,
      sourceKey: finalSourceKey,
      sha256: sourceSha,
      contentType: media.background.mime,
    });
  } else if (deps.sources.put) {
    await deps.sources.put(finalSourceKey, media.background.bytes, {
      httpMetadata: { contentType: media.background.mime },
      customMetadata: { sha256: sourceSha },
    });
    if (quarantineKey !== finalSourceKey) {
      await deps.sources.delete(quarantineKey);
    }
  } else {
    throw new PackageError("sources_put_unavailable", true);
  }

  const { artifacts, digest } = await assemblePackageArtifacts(
    row,
    media,
    generatedAt,
    input,
  );

  return writeVerifyZipAndMarkReady(
    deps,
    row,
    artifacts,
    digest,
    generatedAt,
    media,
    sourceSha,
    finalSourceKey,
    input,
  );
}

/** Queue processor entry: build package for a leased job row. */
export async function processPackageJob(
  deps: BuilderDeps,
  job: { id: string; theme_id: string; version: number },
): Promise<void> {
  await buildPackageVersion(
    { ...deps, jobId: job.id },
    { themeId: job.theme_id, version: job.version, jobId: job.id },
  );
}
