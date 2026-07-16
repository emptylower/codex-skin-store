/**
 * Canonical package inventory + payload digest.
 * payloadDigest excludes install-prompt.md; archiveDigest is ZIP bytes (elsewhere).
 */

export type ArtifactEntry = {
  /** Package-relative path using forward slashes only. */
  path: string;
  /** Exact byte length of the artifact body. */
  size: number;
  /** Artifact body bytes. */
  bytes: Uint8Array;
};

export type InventoryEntry = {
  path: string;
  size: number;
  sha256: string;
};

export const PAYLOAD_EXCLUDED_PATHS = new Set(["install-prompt.md"]);

/** Paths allowed inside a generated theme package. */
export const APPROVED_PACKAGE_PATHS = new Set([
  "manifest.json",
  "preview.jpg",
  "background.png",
  "background.jpg",
  "background.jpeg",
  "background.webp",
  "background.gif",
  "adapters/macos/theme.json",
  "adapters/windows/theme.json",
  "install-prompt.md",
  "INSTALL.md",
]);

export class PackagePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackagePathError";
  }
}

/**
 * Reject path traversal, backslashes, absolute paths, empty names, and
 * unapproved package layout entries.
 */
export function assertSafePackagePath(path: string): void {
  if (!path || typeof path !== "string") {
    throw new PackagePathError("empty_path");
  }
  if (path.includes("\\")) {
    throw new PackagePathError(`backslash_not_allowed:${path}`);
  }
  if (path.startsWith("/") || path.startsWith("./") || path.startsWith("../")) {
    throw new PackagePathError(`absolute_or_relative_path:${path}`);
  }
  if (path.includes("//") || path.endsWith("/")) {
    throw new PackagePathError(`invalid_path_form:${path}`);
  }
  const parts = path.split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) {
    throw new PackagePathError(`path_traversal:${path}`);
  }
  if (!APPROVED_PACKAGE_PATHS.has(path)) {
    // Allow background.* already covered; any other path is rejected.
    throw new PackagePathError(`unapproved_path:${path}`);
  }
}

export async function sha256Hex(data: Uint8Array | ArrayBuffer): Promise<string> {
  const buffer =
    data instanceof ArrayBuffer
      ? data
      : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", buffer as ArrayBuffer);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Path-sorted inventory excluding install-prompt.md.
 * Rejects duplicates and unsafe paths.
 */
export async function canonicalInventory(
  entries: readonly ArtifactEntry[],
): Promise<InventoryEntry[]> {
  const seen = new Set<string>();
  const filtered: ArtifactEntry[] = [];

  for (const entry of entries) {
    assertSafePackagePath(entry.path);
    if (seen.has(entry.path)) {
      throw new PackagePathError(`duplicate_path:${entry.path}`);
    }
    seen.add(entry.path);
    if (PAYLOAD_EXCLUDED_PATHS.has(entry.path)) continue;
    if (entry.size !== entry.bytes.byteLength) {
      throw new PackagePathError(
        `size_mismatch:${entry.path}:${entry.size}:${entry.bytes.byteLength}`,
      );
    }
    filtered.push(entry);
  }

  filtered.sort((a, b) => a.path.localeCompare(b.path));

  return Promise.all(
    filtered.map(async (e) => ({
      path: e.path,
      size: e.size,
      sha256: await sha256Hex(e.bytes),
    })),
  );
}

/**
 * SHA-256 of the canonical inventory lines: `path\tsize\tsha256\n`.
 */
export async function payloadDigest(
  entries: readonly ArtifactEntry[],
): Promise<string> {
  const inventory = await canonicalInventory(entries);
  const canonical = inventory
    .map((e) => `${e.path}\t${e.size}\t${e.sha256}\n`)
    .join("");
  return sha256Hex(new TextEncoder().encode(canonical));
}

/**
 * Validate all package paths (including install-prompt.md) before ZIP write.
 */
export function validatePackageEntries(
  entries: readonly { path?: string; name?: string }[],
): string[] {
  const names = entries.map((e) => e.path ?? e.name ?? "");
  const seen = new Set<string>();
  for (const name of names) {
    assertSafePackagePath(name);
    if (seen.has(name)) {
      throw new PackagePathError(`duplicate_path:${name}`);
    }
    seen.add(name);
  }
  return names;
}
