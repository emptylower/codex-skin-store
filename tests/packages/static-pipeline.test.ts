import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MACOS_TARGET,
  WINDOWS_TARGET,
  type CreatorInput,
} from "~/domain/themes/creator-input";
import {
  buildPackageVersion,
  checkStoredPackage,
  type BuilderDeps,
} from "~/services/package-builder.server";
import { jpeg, png, webp } from "../helpers/media";

const NOW = 1_700_600_000_000;
const THEME_ID = "theme-1";
const USER_ID = "user-1";
const VERSION = 1;

const creatorInput: CreatorInput = {
  sourceLocale: "en",
  name: "Neon Road",
  description:
    "A high-contrast night drive shell for long coding sessions after dark.",
  slug: "neon-road",
  license: "CC0-1.0",
  attribution: "",
  sourceUrl: "",
  platforms: ["macos", "windows"],
  appearance: "dark",
  mediaType: "static",
  accent: "#FF00AA",
  secondary: "#110022",
  highlight: "#00FFCC",
  focalPoint: { x: 0.5, y: 0.4 },
  compatibilityTargets: [MACOS_TARGET, WINDOWS_TARGET],
  rightsDeclared: true,
};

type StoredObject = {
  body: Uint8Array;
  size: number;
  etag: string;
  httpMetadata?: R2HTTPMetadata;
  customMetadata: Record<string, string>;
  uploaded: Date;
};

function createMemoryBucket() {
  const store = new Map<string, StoredObject>();

  const api = {
    store,
    async head(key: string): Promise<R2Object | null> {
      const obj = store.get(key);
      if (!obj) return null;
      return {
        key,
        size: obj.size,
        etag: obj.etag,
        httpEtag: `"${obj.etag}"`,
        uploaded: obj.uploaded,
        httpMetadata: obj.httpMetadata,
        customMetadata: { ...obj.customMetadata },
        checksums: {
          toJSON() {
            return {};
          },
        },
        storageClass: "Standard",
        writeHttpMetadata() {
          /* no-op for mock */
        },
      } as unknown as R2Object;
    },
    async get(key: string): Promise<R2ObjectBody | null> {
      const obj = store.get(key);
      if (!obj) return null;
      const body = obj.body;
      return {
        key,
        size: obj.size,
        etag: obj.etag,
        httpEtag: `"${obj.etag}"`,
        uploaded: obj.uploaded,
        httpMetadata: obj.httpMetadata,
        customMetadata: { ...obj.customMetadata },
        checksums: {
          toJSON() {
            return {};
          },
        },
        storageClass: "Standard",
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(body);
            controller.close();
          },
        }),
        bodyUsed: false,
        arrayBuffer: async () =>
          body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
        text: async () => new TextDecoder().decode(body),
        json: async () => JSON.parse(new TextDecoder().decode(body)),
        blob: async () => new Blob([body]),
        writeHttpMetadata() {
          /* no-op */
        },
      } as unknown as R2ObjectBody;
    },
    async put(
      key: string,
      value:
        | ReadableStream
        | ArrayBuffer
        | ArrayBufferView
        | string
        | null
        | Blob,
      options?: R2PutOptions,
    ): Promise<R2Object> {
      let body: Uint8Array;
      if (value == null) {
        body = new Uint8Array(0);
      } else if (typeof value === "string") {
        body = new TextEncoder().encode(value);
      } else if (value instanceof ArrayBuffer) {
        body = new Uint8Array(value);
      } else if (ArrayBuffer.isView(value)) {
        body = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      } else if (value instanceof Blob) {
        body = new Uint8Array(await value.arrayBuffer());
      } else {
        body = new Uint8Array(await new Response(value).arrayBuffer());
      }
      const etag = `etag-${key}-${body.byteLength}`;
      store.set(key, {
        body,
        size: body.byteLength,
        etag,
        httpMetadata: options?.httpMetadata,
        customMetadata: { ...(options?.customMetadata ?? {}) },
        uploaded: new Date(NOW),
      });
      return (await api.head(key))!;
    },
    async delete(keys: string | string[]): Promise<void> {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        store.delete(key);
      }
    },
    async list(options?: R2ListOptions) {
      const prefix = options?.prefix ?? "";
      const objects = [...store.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, obj]) => ({
          key,
          size: obj.size,
          etag: obj.etag,
          httpEtag: `"${obj.etag}"`,
          uploaded: obj.uploaded,
          httpMetadata: obj.httpMetadata,
          customMetadata: { ...obj.customMetadata },
          checksums: {
            toJSON() {
              return {};
            },
          },
          storageClass: "Standard",
          writeHttpMetadata() {
            /* no-op */
          },
        }));
      return {
        objects: objects as unknown as R2Object[],
        truncated: false,
        delimitedPrefixes: [] as string[],
      };
    },
  };

  return api;
}

function createMockImages(format: string, width: number, height: number) {
  const preview = new Uint8Array(8_000);
  preview[0] = 0xff;
  preview[1] = 0xd8;
  preview[2] = 0xff;

  return {
    info: vi.fn(async (stream: ReadableStream<Uint8Array>) => {
      const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      return {
        format,
        fileSize: bytes.length,
        width,
        height,
      };
    }),
    input: vi.fn((_stream: ReadableStream<Uint8Array>) => ({
      transform: vi.fn(() => ({
        output: vi.fn(async () => ({
          image: () =>
            new ReadableStream({
              start(controller) {
                controller.enqueue(preview);
                controller.close();
              },
            }),
          response: () => new Response(preview),
          contentType: () => "image/jpeg",
        })),
      })),
    })),
    hosted: {} as ImagesBinding["hosted"],
  } satisfies ImagesBinding;
}

function fixtureBytes(extension: "png" | "jpg" | "webp"): {
  bytes: Uint8Array;
  mime: string;
  format: string;
} {
  if (extension === "png") {
    return { bytes: png(640, 400), mime: "image/png", format: "image/png" };
  }
  if (extension === "jpg") {
    return { bytes: jpeg(640, 400), mime: "image/jpeg", format: "image/jpeg" };
  }
  return { bytes: webp(640, 400), mime: "image/webp", format: "image/webp" };
}

async function seedFixture(extension: "png" | "jpg" | "webp") {
  const { bytes, mime, format } = fixtureBytes(extension);
  const quarantineKey = `quarantine/${THEME_ID}/${VERSION}/upload-1`;
  const packages = createMemoryBucket();
  const sources = createMemoryBucket();

  await sources.put(quarantineKey, bytes, {
    customMetadata: {
      "upload-id": "upload-1",
      "expected-bytes": String(bytes.byteLength),
    },
  });

  await env.DB.prepare(
    `INSERT INTO users (
       id, handle, display_name, bio, role, upload_status,
       email_verified, deletion_status, created_at, updated_at
     ) VALUES (?, 'neon', 'Neon', '', 'user', 'active', 1, 'active', ?, ?)
     ON CONFLICT(id) DO UPDATE SET handle = excluded.handle`,
  )
    .bind(USER_ID, NOW, NOW)
    .run();

  await env.DB.prepare(
    `INSERT INTO themes (
       id, author_id, slug, source_locale, current_version,
       visibility, moderation_status, package_status,
       favorites_count, downloads_count, created_at, updated_at
     ) VALUES (?, ?, 'neon-road', 'en', NULL, 'draft', 'clean', 'processing', 0, 0, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       package_status = 'processing',
       current_version = NULL,
       updated_at = excluded.updated_at`,
  )
    .bind(THEME_ID, USER_ID, NOW, NOW)
    .run();

  await env.DB.prepare(
    `INSERT INTO theme_versions (
       id, theme_id, version, manifest_json, package_key,
       payload_digest, archive_digest, published_at,
       created_at, updated_at, creator_input_json, generation_state,
       source_key, source_mime, source_bytes
     ) VALUES (?, ?, ?, '{}', NULL, NULL, NULL, NULL, ?, ?, ?, 'queued', ?, ?, ?)
     ON CONFLICT(theme_id, version) DO UPDATE SET
       generation_state = 'queued',
       creator_input_json = excluded.creator_input_json,
       source_key = excluded.source_key,
       source_mime = excluded.source_mime,
       source_bytes = excluded.source_bytes,
       package_key = NULL,
       payload_digest = NULL,
       archive_digest = NULL,
       updated_at = excluded.updated_at`,
  )
    .bind(
      `ver-${THEME_ID}-${VERSION}`,
      THEME_ID,
      VERSION,
      NOW,
      NOW,
      JSON.stringify(creatorInput),
      quarantineKey,
      mime,
      bytes.byteLength,
    )
    .run();

  await env.DB.prepare(
    `INSERT INTO source_uploads (
       id, theme_id, version, user_id, quarantine_key,
       declared_content_type, expected_bytes, state,
       r2_etag, expires_at, completed_at, created_at
     ) VALUES ('upload-1', ?, ?, ?, ?, ?, ?, 'completed', 'etag-q', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       state = 'completed',
       quarantine_key = excluded.quarantine_key,
       expected_bytes = excluded.expected_bytes`,
  )
    .bind(
      THEME_ID,
      VERSION,
      USER_ID,
      quarantineKey,
      mime,
      bytes.byteLength,
      NOW + 600_000,
      NOW,
      NOW,
    )
    .run();

  await env.DB.prepare(
    `INSERT INTO package_jobs (
       id, idempotency_key, theme_id, version, state,
       attempt, max_attempts, available_at,
       lease_owner, lease_expires_at,
       last_error_code, last_error_detail,
       created_at, updated_at, finished_at
     ) VALUES ('job-1', ?, ?, ?, 'leased', 1, 5, ?, 'worker-a', ?, NULL, NULL, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET state = 'leased', attempt = 1`,
  )
    .bind(
      `package:${THEME_ID}:${VERSION}`,
      THEME_ID,
      VERSION,
      NOW,
      NOW + 300_000,
      NOW,
      NOW,
    )
    .run();

  const deps: BuilderDeps = {
    db: env.DB,
    sources: {
      head: async (key) => {
        const obj = await sources.head(key);
        if (!obj) return null;
        return {
          size: obj.size,
          etag: obj.etag,
          customMetadata: obj.customMetadata ?? {},
        };
      },
      get: async (key) => {
        const obj = await sources.get(key);
        if (!obj) return null;
        return new Uint8Array(await obj.arrayBuffer());
      },
      delete: async (key) => {
        await sources.delete(key);
      },
      put: async (key, body, options) => {
        await sources.put(key, body, options);
      },
      moveQuarantineToSource: async (input) => {
        const obj = await sources.get(input.quarantineKey);
        if (!obj) {
          // Already moved — verify destination exists.
          const dest = await sources.head(input.sourceKey);
          if (!dest) {
            throw new Error("quarantine_and_source_missing");
          }
          return;
        }
        const body = new Uint8Array(await obj.arrayBuffer());
        await sources.put(input.sourceKey, body, {
          httpMetadata: { contentType: input.contentType },
          customMetadata: { sha256: input.sha256 },
        });
        await sources.delete(input.quarantineKey);
      },
    },
    packages: packages as unknown as R2Bucket,
    images: createMockImages(format, 640, 400),
    reencodeLargeSource: null,
    enableGif: false,
    jobId: "job-1",
  };

  return {
    deps,
    packages,
    sources,
    quarantineKey,
    job: {
      themeId: THEME_ID,
      version: VERSION,
      jobId: "job-1",
    },
  };
}

describe("static package pipeline", () => {
  beforeEach(async () => {
    await env.DB.prepare(`DELETE FROM package_jobs`).run();
    await env.DB.prepare(`DELETE FROM source_uploads`).run();
    await env.DB.prepare(`DELETE FROM theme_translations`).run();
    await env.DB.prepare(`DELETE FROM theme_versions`).run();
    await env.DB.prepare(`DELETE FROM themes`).run();
    await env.DB.prepare(`DELETE FROM users`).run();
  });

  it.each(["png", "jpg", "webp"] as const)(
    "builds a verified %s package",
    async (extension) => {
      const { deps, job } = await seedFixture(extension);
      const result = await buildPackageVersion(deps, job);
      expect(result).toMatchObject({
        generationState: "ready",
        packageKey: "themes/theme-1/versions/1/generated/theme.zip",
      });
      await expect(
        checkStoredPackage(deps.packages, result.packageKey),
      ).resolves.toMatchObject({
        payloadDigest: result.payloadDigest,
        archiveDigest: result.archiveDigest,
      });

      const row = await env.DB.prepare(
        `SELECT generation_state, package_key, payload_digest, archive_digest
         FROM theme_versions WHERE theme_id = ? AND version = ?`,
      )
        .bind(THEME_ID, VERSION)
        .first<{
          generation_state: string;
          package_key: string;
          payload_digest: string;
          archive_digest: string;
        }>();
      expect(row).toMatchObject({
        generation_state: "ready",
        package_key: result.packageKey,
        payload_digest: result.payloadDigest,
        archive_digest: result.archiveDigest,
      });

      // Idempotent re-run against ready version.
      const again = await buildPackageVersion(deps, job);
      expect(again).toMatchObject({
        generationState: "ready",
        payloadDigest: result.payloadDigest,
        archiveDigest: result.archiveDigest,
      });
    },
  );
});
