export type PackageStore = {
  /**
   * Open package by key derived from D1 (never from request path).
   * Supports conditional GET and byte ranges via R2 onlyIf/range.
   */
  open(
    key: string,
    options?: {
      onlyIf?: Headers | R2Conditional;
      range?: Headers | R2Range;
    },
  ): Promise<R2ObjectBody | null | R2Object>;
};

export function createR2PackageStore(bucket: R2Bucket): PackageStore {
  return {
    open(key, options) {
      return bucket.get(key, {
        onlyIf: options?.onlyIf,
        range: options?.range,
      });
    },
  };
}

function safeFilenameSlug(slug: string): string {
  const cleaned = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return cleaned || "theme";
}

export type StreamPackageInput = {
  store: PackageStore;
  /** Key from D1 theme_versions.package_key only. */
  packageKey: string;
  slug: string;
  request: Request;
};

/**
 * Stream zip from PACKAGES without buffering. Supports HEAD, 206, 304, 416.
 * Never accepts arbitrary client-supplied R2 keys.
 */
export async function streamPackageDownload(
  input: StreamPackageInput,
): Promise<Response> {
  const { store, packageKey, slug, request } = input;
  if (!packageKey || packageKey.includes("..") || packageKey.startsWith("/")) {
    return new Response("Not Found", { status: 404 });
  }

  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const hasRange = request.headers.has("Range");
  const hasConditional =
    request.headers.has("If-None-Match") ||
    request.headers.has("If-Match") ||
    request.headers.has("If-Modified-Since") ||
    request.headers.has("If-Unmodified-Since");

  const object = await store.open(packageKey, {
    onlyIf: hasConditional ? request.headers : undefined,
    range: hasRange ? request.headers : undefined,
  });

  if (object === null) {
    return new Response("Not Found", { status: 404 });
  }

  // Conditional request not modified (R2 returns body-less R2Object).
  if (!("body" in object) || object.body === null) {
    const headers = new Headers();
    headers.set("ETag", object.httpEtag);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Cache-Control", "private, no-store");
    headers.set("Content-Type", "application/zip");
    headers.set(
      "Content-Disposition",
      `attachment; filename="codex-theme-${safeFilenameSlug(slug)}.zip"`,
    );
    if ("writeHttpMetadata" in object && object.writeHttpMetadata) {
      object.writeHttpMetadata(headers);
    }
    return new Response(null, { status: 304, headers });
  }

  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  headers.set("Content-Type", "application/zip");
  headers.set(
    "Content-Disposition",
    `attachment; filename="codex-theme-${safeFilenameSlug(slug)}.zip"`,
  );
  headers.set("ETag", object.httpEtag);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", "private, no-store");
  headers.set("Accept-Ranges", "bytes");

  if (object.size != null) {
    headers.set("Content-Length", String(object.size));
  }

  let status = 200;
  const range = object.range;
  if (
    hasRange &&
    range &&
    "offset" in range &&
    typeof range.offset === "number"
  ) {
    status = 206;
    const offset = range.offset;
    const length =
      "length" in range && typeof range.length === "number"
        ? range.length
        : object.size;
    const end = offset + length - 1;
    const total =
      "size" in object && typeof (object as R2ObjectBody).size === "number"
        ? (object as R2ObjectBody).size
        : "*";
    headers.set("Content-Range", `bytes ${offset}-${end}/${total}`);
    headers.set("Content-Length", String(length));
  }

  if (method === "HEAD") {
    return new Response(null, { status, headers });
  }

  return new Response(object.body, { status, headers });
}
