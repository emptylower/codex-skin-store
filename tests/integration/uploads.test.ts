import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MACOS_TARGET,
  WINDOWS_TARGET,
  type CreatorInput,
} from "~/domain/themes/creator-input";
import { createDraft } from "~/services/creator-themes.server";
import {
  completeUpload,
  issueUpload,
  UploadError,
} from "~/services/uploads.server";

const NOW = 1_700_400_000_000;

const validCreatorInput: CreatorInput = {
  sourceLocale: "en",
  name: "Neon Road Draft",
  description:
    "A high-contrast night drive shell for long coding sessions after dark.",
  slug: "neon-road-upload-test",
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

type HeadObject = {
  size: number;
  etag: string;
  customMetadata: Record<string, string>;
};

function createMockSources(initial?: Map<string, HeadObject>) {
  const store = initial ?? new Map<string, HeadObject>();
  return {
    store,
    head: vi.fn(async (key: string) => store.get(key) ?? null),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    put: vi.fn(async (key: string, object: HeadObject) => {
      store.set(key, object);
    }),
  };
}

async function insertUser(
  id: string,
  handle: string,
  uploadStatus: "active" | "suspended" = "active",
) {
  await env.DB.prepare(
    `INSERT INTO users (
       id, handle, display_name, bio, role, upload_status,
       email_verified, deletion_status, created_at, updated_at
     ) VALUES (?, ?, ?, '', 'user', ?, 0, 'active', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       handle = excluded.handle,
       upload_status = excluded.upload_status,
       updated_at = excluded.updated_at`,
  )
    .bind(id, handle, handle, uploadStatus, NOW, NOW)
    .run();
}

describe("draft-bound direct uploads", () => {
  beforeEach(async () => {
    await env.DB.prepare(`DELETE FROM package_jobs`).run();
    await env.DB.prepare(`DELETE FROM source_uploads`).run();
    await env.DB.prepare(`DELETE FROM theme_translations`).run();
    await env.DB.prepare(`DELETE FROM theme_versions`).run();
    await env.DB.prepare(`DELETE FROM themes`).run();
    await insertUser("u1", "uploader-one");
    await insertUser("u2", "uploader-two");
  });

  it("creates one private draft and queues completion once", async () => {
    const sources = createMockSources();
    const queue = { send: vi.fn(async () => undefined) };
    const presign = {
      signPut: vi.fn(async () => ({
        url: "https://r2.test/presigned",
        headers: { "content-type": "image/png" },
      })),
    };

    const deps = {
      db: env.DB,
      sources,
      queue,
      presign,
      now: () => NOW,
      userId: "u1",
    };

    const draft = await createDraft(deps, validCreatorInput);
    expect(draft).toMatchObject({
      version: 1,
      visibility: "draft",
      packageStatus: "processing",
    });

    const issued = await issueUpload(deps, {
      userId: "u1",
      themeId: draft.themeId,
      version: 1,
      contentType: "image/png",
      bytes: 1024,
    });
    expect(issued.key).toMatch(/^quarantine\/.+\/versions\/1\/[0-9a-f-]+$/);
    expect(presign.signPut).toHaveBeenCalledOnce();

    sources.store.set(issued.key, {
      size: 1024,
      etag: '"etag-1"',
      customMetadata: {
        "upload-id": issued.uploadId,
        "expected-bytes": "1024",
      },
    });

    await completeUpload(deps, { userId: "u1", uploadId: issued.uploadId });
    await completeUpload(deps, { userId: "u1", uploadId: issued.uploadId });
    expect(deps.queue.send).toHaveBeenCalledTimes(1);

    const job = await env.DB.prepare(
      `SELECT idempotency_key, state FROM package_jobs WHERE theme_id = ? AND version = 1`,
    )
      .bind(draft.themeId)
      .first<{ idempotency_key: string; state: string }>();
    expect(job).toMatchObject({
      idempotency_key: `package:${draft.themeId}:1`,
      state: "queued",
    });

    const version = await env.DB.prepare(
      `SELECT generation_state FROM theme_versions WHERE theme_id = ? AND version = 1`,
    )
      .bind(draft.themeId)
      .first<{ generation_state: string }>();
    expect(version?.generation_state).toBe("queued");
  });

  it("rejects unauthorized complete and wrong owner", async () => {
    const sources = createMockSources();
    const queue = { send: vi.fn(async () => undefined) };
    const presign = {
      signPut: vi.fn(async () => ({
        url: "https://r2.test/presigned",
        headers: {},
      })),
    };
    const deps = {
      db: env.DB,
      sources,
      queue,
      presign,
      now: () => NOW,
      userId: "u1",
    };

    const draft = await createDraft(deps, {
      ...validCreatorInput,
      slug: "owner-check-theme",
    });
    const issued = await issueUpload(deps, {
      userId: "u1",
      themeId: draft.themeId,
      version: 1,
      contentType: "image/png",
      bytes: 512,
    });
    sources.store.set(issued.key, {
      size: 512,
      etag: '"e"',
      customMetadata: {
        "upload-id": issued.uploadId,
        "expected-bytes": "512",
      },
    });

    await expect(
      completeUpload(deps, { userId: "u2", uploadId: issued.uploadId }),
    ).rejects.toMatchObject({ code: "forbidden" });

    await expect(
      completeUpload(deps, { userId: "u1", uploadId: "missing-upload" }),
    ).rejects.toMatchObject({ code: "not_found" });

    expect(queue.send).not.toHaveBeenCalled();
  });

  it("rejects size mismatch and deletes quarantine object", async () => {
    const sources = createMockSources();
    const queue = { send: vi.fn(async () => undefined) };
    const presign = {
      signPut: vi.fn(async () => ({
        url: "https://r2.test/presigned",
        headers: {},
      })),
    };
    const deps = {
      db: env.DB,
      sources,
      queue,
      presign,
      now: () => NOW,
      userId: "u1",
    };

    const draft = await createDraft(deps, {
      ...validCreatorInput,
      slug: "size-mismatch-theme",
    });
    const issued = await issueUpload(deps, {
      userId: "u1",
      themeId: draft.themeId,
      version: 1,
      contentType: "image/png",
      bytes: 1024,
    });

    sources.store.set(issued.key, {
      size: 2048,
      etag: '"bad"',
      customMetadata: {
        "upload-id": issued.uploadId,
        "expected-bytes": "1024",
      },
    });

    await expect(
      completeUpload(deps, { userId: "u1", uploadId: issued.uploadId }),
    ).rejects.toBeInstanceOf(UploadError);

    expect(sources.delete).toHaveBeenCalledWith(issued.key);
    expect(sources.store.has(issued.key)).toBe(false);
    expect(queue.send).not.toHaveBeenCalled();

    const upload = await env.DB.prepare(
      `SELECT state FROM source_uploads WHERE id = ?`,
    )
      .bind(issued.uploadId)
      .first<{ state: string }>();
    expect(upload?.state).toBe("rejected");
  });

  it("rejects drafts from suspended uploaders and duplicate slugs", async () => {
    await insertUser("u-suspended", "suspended-user", "suspended");
    const deps = {
      db: env.DB,
      now: () => NOW,
      userId: "u-suspended",
    };

    await expect(
      createDraft(deps, {
        ...validCreatorInput,
        slug: "suspended-theme",
      }),
    ).rejects.toMatchObject({ code: "upload_suspended" });

    const active = {
      db: env.DB,
      now: () => NOW,
      userId: "u1",
    };
    await createDraft(active, {
      ...validCreatorInput,
      slug: "dup-slug-theme",
    });
    await expect(
      createDraft(active, {
        ...validCreatorInput,
        slug: "dup-slug-theme",
      }),
    ).rejects.toMatchObject({ code: "slug_taken" });
  });

  it("rejects re-issue after complete", async () => {
    const sources = createMockSources();
    const queue = { send: vi.fn(async () => undefined) };
    const presign = {
      signPut: vi.fn(async () => ({
        url: "https://r2.test/presigned",
        headers: { "content-type": "image/png" },
      })),
    };
    const deps = {
      db: env.DB,
      sources,
      queue,
      presign,
      now: () => NOW,
      userId: "u1",
    };

    const draft = await createDraft(deps, {
      ...validCreatorInput,
      slug: "reissue-after-complete",
    });
    const issued = await issueUpload(deps, {
      userId: "u1",
      themeId: draft.themeId,
      version: 1,
      contentType: "image/png",
      bytes: 1024,
    });
    sources.store.set(issued.key, {
      size: 1024,
      etag: '"etag-complete"',
      customMetadata: {
        "upload-id": issued.uploadId,
        "expected-bytes": "1024",
      },
    });
    await completeUpload(deps, { userId: "u1", uploadId: issued.uploadId });

    await expect(
      issueUpload(deps, {
        userId: "u1",
        themeId: draft.themeId,
        version: 1,
        contentType: "image/png",
        bytes: 2048,
      }),
    ).rejects.toMatchObject({ code: "already_completed" });
  });

  it("rejects issue from suspended users", async () => {
    const sources = createMockSources();
    const queue = { send: vi.fn(async () => undefined) };
    const presign = {
      signPut: vi.fn(async () => ({
        url: "https://r2.test/presigned",
        headers: {},
      })),
    };

    // Create draft while active, then suspend.
    const activeDeps = {
      db: env.DB,
      sources,
      queue,
      presign,
      now: () => NOW,
      userId: "u1",
    };
    const draft = await createDraft(activeDeps, {
      ...validCreatorInput,
      slug: "suspended-issue-theme",
    });
    await insertUser("u1", "uploader-one", "suspended");

    await expect(
      issueUpload(activeDeps, {
        userId: "u1",
        themeId: draft.themeId,
        version: 1,
        contentType: "image/png",
        bytes: 512,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("double complete still sends the queue once", async () => {
    const sources = createMockSources();
    const queue = { send: vi.fn(async () => undefined) };
    const presign = {
      signPut: vi.fn(async () => ({
        url: "https://r2.test/presigned",
        headers: {},
      })),
    };
    const deps = {
      db: env.DB,
      sources,
      queue,
      presign,
      now: () => NOW,
      userId: "u1",
    };

    const draft = await createDraft(deps, {
      ...validCreatorInput,
      slug: "double-complete-theme",
    });
    const issued = await issueUpload(deps, {
      userId: "u1",
      themeId: draft.themeId,
      version: 1,
      contentType: "image/png",
      bytes: 256,
    });
    sources.store.set(issued.key, {
      size: 256,
      etag: '"etag-d"',
      customMetadata: {
        "upload-id": issued.uploadId,
        "expected-bytes": "256",
      },
    });

    const first = await completeUpload(deps, {
      userId: "u1",
      uploadId: issued.uploadId,
    });
    const second = await completeUpload(deps, {
      userId: "u1",
      uploadId: issued.uploadId,
    });

    expect(first.queued).toBe(true);
    expect(second.queued).toBe(false);
    expect(first.jobId).toBeTruthy();
    expect(second.jobId).toBe(first.jobId);
    expect(queue.send).toHaveBeenCalledTimes(1);
  });

  it("recovers completed upload missing package job", async () => {
    const sources = createMockSources();
    const queue = { send: vi.fn(async () => undefined) };
    const presign = {
      signPut: vi.fn(async () => ({
        url: "https://r2.test/presigned",
        headers: {},
      })),
    };
    const deps = {
      db: env.DB,
      sources,
      queue,
      presign,
      now: () => NOW,
      userId: "u1",
    };

    const draft = await createDraft(deps, {
      ...validCreatorInput,
      slug: "recover-missing-job",
    });
    const issued = await issueUpload(deps, {
      userId: "u1",
      themeId: draft.themeId,
      version: 1,
      contentType: "image/png",
      bytes: 128,
    });
    sources.store.set(issued.key, {
      size: 128,
      etag: '"etag-r"',
      customMetadata: {
        "upload-id": issued.uploadId,
        "expected-bytes": "128",
      },
    });

    // Simulate completed upload + queued version without package_jobs row.
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE source_uploads
         SET state = 'completed', r2_etag = ?, completed_at = ?
         WHERE id = ?`,
      ).bind('"etag-r"', NOW, issued.uploadId),
      env.DB.prepare(
        `UPDATE theme_versions
         SET generation_state = 'queued',
             source_key = ?,
             source_bytes = ?,
             updated_at = ?
         WHERE theme_id = ? AND version = 1`,
      ).bind(issued.key, 128, NOW, draft.themeId),
    ]);

    const recovered = await completeUpload(deps, {
      userId: "u1",
      uploadId: issued.uploadId,
    });
    expect(recovered.queued).toBe(true);
    expect(recovered.jobId).toBeTruthy();
    expect(queue.send).toHaveBeenCalledTimes(1);

    // Second recovery is idempotent.
    const again = await completeUpload(deps, {
      userId: "u1",
      uploadId: issued.uploadId,
    });
    expect(again.queued).toBe(false);
    expect(again.jobId).toBe(recovered.jobId);
    expect(queue.send).toHaveBeenCalledTimes(1);
  });
});
