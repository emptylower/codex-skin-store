import {
  payloadDigest,
  sha256Hex,
  type ArtifactEntry,
} from "~/domain/themes/package-inventory";
import {
  PACKAGE_ZIP_MTIME,
  resolveZipWriter,
  streamZipBytes,
} from "~/platform/cloudflare/zip.server";

export class PackageError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, retryable: boolean, detail?: string) {
    super(detail ?? code);
    this.name = "PackageError";
    this.code = code;
    this.retryable = retryable;
  }
}

export type PutImmutableOptions = {
  contentType: string;
  /** When true, existing matching object is a no-op; mismatch is permanent. */
  immutable?: boolean;
};

export type ImmutablePutResult = {
  key: string;
  size: number;
  sha256: string;
  skipped: boolean;
};

const IMMUTABLE_HTTP = {
  contentDisposition: "attachment" as const,
  cacheControl: "private, no-store",
};

/**
 * Put an immutable artifact and HEAD-verify size + custom sha256 metadata.
 * On retry, exact matches are skipped; any mismatch is a permanent collision.
 */
export async function putImmutableArtifact(
  bucket: R2Bucket,
  key: string,
  body: Uint8Array,
  options: PutImmutableOptions,
): Promise<ImmutablePutResult> {
  const size = body.byteLength;
  const sha256 = await sha256Hex(body);

  const existing = await bucket.head(key);
  if (existing) {
    const existingSha = existing.customMetadata?.sha256;
    if (existing.size === size && existingSha === sha256) {
      return { key, size, sha256, skipped: true };
    }
    throw new PackageError(
      "artifact_collision",
      false,
      `key=${key} existing_size=${existing.size} existing_sha=${existingSha ?? ""} expected_size=${size} expected_sha=${sha256}`,
    );
  }

  await bucket.put(key, body, {
    httpMetadata: {
      contentType: options.contentType,
      ...IMMUTABLE_HTTP,
    },
    customMetadata: { sha256 },
    // Cloudflare R2 accepts onlyOnlyIf etc.; sha256 option is for checksum when supported.
    // Custom metadata is the authoritative verification path in this pipeline.
  });

  const verified = await bucket.head(key);
  if (
    !verified ||
    verified.size !== size ||
    verified.customMetadata?.sha256 !== sha256
  ) {
    throw new PackageError("artifact_verification_failed", true);
  }

  return { key, size, sha256, skipped: false };
}

export type ZipPromotionInput = {
  bucket: R2Bucket;
  jobId: string;
  finalKey: string;
  artifacts: readonly ArtifactEntry[];
  payloadDigest: string;
  generatedAt: Date;
  zipFlag?: string | null;
};

export type ZipPromotionResult = {
  packageKey: string;
  archiveBytes: number;
  archiveDigest: string;
  payloadDigest: string;
  skipped: boolean;
};

/**
 * Stream ZIP to staging, verify, copy to final immutable key with digests, delete staging.
 */
export async function writeAndPromoteZip(
  input: ZipPromotionInput,
): Promise<ZipPromotionResult> {
  const existing = await input.bucket.head(input.finalKey);
  if (existing) {
    const existingArchive = existing.customMetadata?.["archive-digest"];
    const existingPayload = existing.customMetadata?.["payload-digest"];
    if (
      existingArchive &&
      existingPayload === input.payloadDigest &&
      existingArchive.length === 64
    ) {
      // Recompute archive digest from body to confirm exact match path on retry.
      const body = await input.bucket.get(input.finalKey);
      if (body) {
        const bytes = new Uint8Array(await body.arrayBuffer());
        const digest = await sha256Hex(bytes);
        if (digest === existingArchive && existing.size === bytes.byteLength) {
          return {
            packageKey: input.finalKey,
            archiveBytes: existing.size,
            archiveDigest: existingArchive,
            payloadDigest: input.payloadDigest,
            skipped: true,
          };
        }
      }
    }
    throw new PackageError(
      "artifact_collision",
      false,
      `zip_collision:${input.finalKey}`,
    );
  }

  const writer = resolveZipWriter(input.zipFlag);
  const lastModified = input.generatedAt;
  // Prefer fixed PACKAGE_ZIP_MTIME for store stability across retries.
  void lastModified;
  const zipEntries = input.artifacts.map((a) => ({
    path: a.path,
    size: a.size,
    lastModified: PACKAGE_ZIP_MTIME,
    body: a.bytes,
  }));
  const zipBytes = await streamZipBytes(writer, zipEntries);
  const archiveDigest = await sha256Hex(zipBytes);
  const archiveBytes = zipBytes.byteLength;

  const stagingKey = `staging/zips/${input.jobId}.zip`;
  await input.bucket.put(stagingKey, zipBytes, {
    httpMetadata: {
      contentType: "application/zip",
      ...IMMUTABLE_HTTP,
    },
    customMetadata: {
      sha256: archiveDigest,
      "archive-digest": archiveDigest,
      "payload-digest": input.payloadDigest,
    },
  });

  const staged = await input.bucket.head(stagingKey);
  if (
    !staged ||
    staged.size !== archiveBytes ||
    staged.customMetadata?.sha256 !== archiveDigest
  ) {
    throw new PackageError("artifact_verification_failed", true, "staging_zip");
  }

  // Copy to final key (R2 copy when available; otherwise put bytes).
  const stagedBody = await input.bucket.get(stagingKey);
  if (!stagedBody) {
    throw new PackageError("artifact_verification_failed", true, "staging_gone");
  }
  const finalBytes = new Uint8Array(await stagedBody.arrayBuffer());

  await input.bucket.put(input.finalKey, finalBytes, {
    httpMetadata: {
      contentType: "application/zip",
      ...IMMUTABLE_HTTP,
    },
    customMetadata: {
      sha256: archiveDigest,
      "archive-digest": archiveDigest,
      "payload-digest": input.payloadDigest,
    },
  });

  const finalHead = await input.bucket.head(input.finalKey);
  if (
    !finalHead ||
    finalHead.size !== archiveBytes ||
    finalHead.customMetadata?.["archive-digest"] !== archiveDigest ||
    finalHead.customMetadata?.["payload-digest"] !== input.payloadDigest
  ) {
    throw new PackageError("artifact_verification_failed", true, "final_zip");
  }

  try {
    await input.bucket.delete(stagingKey);
  } catch {
    // Sweeper will clean staging leftovers.
  }

  return {
    packageKey: input.finalKey,
    archiveBytes,
    archiveDigest,
    payloadDigest: input.payloadDigest,
    skipped: false,
  };
}

export type StoredPackageCheck = {
  packageKey: string;
  payloadDigest: string;
  archiveDigest: string;
  size: number;
};

/**
 * HEAD/GET the stored ZIP and verify digests in custom metadata match body.
 */
export async function checkStoredPackage(
  bucket: R2Bucket,
  packageKey: string,
): Promise<StoredPackageCheck> {
  const head = await bucket.head(packageKey);
  if (!head) {
    throw new PackageError("package_missing", false, packageKey);
  }
  const metaArchive = head.customMetadata?.["archive-digest"];
  const metaPayload = head.customMetadata?.["payload-digest"];
  if (!metaArchive || !metaPayload) {
    throw new PackageError("package_metadata_missing", false, packageKey);
  }

  const obj = await bucket.get(packageKey);
  if (!obj) {
    throw new PackageError("package_missing", false, packageKey);
  }
  const bytes = new Uint8Array(await obj.arrayBuffer());
  const archiveDigest = await sha256Hex(bytes);
  if (archiveDigest !== metaArchive || bytes.byteLength !== head.size) {
    throw new PackageError("archive_digest_mismatch", false, packageKey);
  }

  return {
    packageKey,
    payloadDigest: metaPayload,
    archiveDigest,
    size: head.size,
  };
}

export { payloadDigest, sha256Hex };
