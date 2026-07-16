import { describe, expect, it } from "vitest";

import {
  PackagePathError,
  assertSafePackagePath,
  canonicalInventory,
  payloadDigest,
  sha256Hex,
} from "~/domain/themes/package-inventory";

function entry(path: string, text: string) {
  const bytes = new TextEncoder().encode(text);
  return { path, size: bytes.byteLength, bytes };
}

describe("package inventory", () => {
  it("excludes install-prompt.md from payload digest inventory", async () => {
    const entries = [
      entry("install-prompt.md", "PROMPT"),
      entry("INSTALL.md", "INSTALL"),
      entry("manifest.json", '{"schemaVersion":1}'),
      entry("preview.jpg", "JPEG"),
      entry("adapters/macos/theme.json", '{"schemaVersion":1}'),
    ];

    const inventory = await canonicalInventory(entries);
    expect(inventory.map((x) => x.path)).not.toContain("install-prompt.md");
    expect(inventory.map((x) => x.path)).toEqual(
      [
        "INSTALL.md",
        "adapters/macos/theme.json",
        "manifest.json",
        "preview.jpg",
      ].sort((a, b) => a.localeCompare(b)),
    );

    const digest = await payloadDigest(entries);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);

    // Prompt content must not affect payload digest.
    const withoutPrompt = entries.filter((e) => e.path !== "install-prompt.md");
    expect(await payloadDigest(withoutPrompt)).toBe(digest);

    // Changing prompt content still yields the same digest.
    const changedPrompt = [
      ...withoutPrompt,
      entry("install-prompt.md", "DIFFERENT PROMPT"),
    ];
    expect(await payloadDigest(changedPrompt)).toBe(digest);
  });

  it("rejects path traversal, backslashes, absolute paths, and duplicates", async () => {
    expect(() => assertSafePackagePath("../secret")).toThrow(PackagePathError);
    expect(() => assertSafePackagePath("foo\\bar")).toThrow(PackagePathError);
    expect(() => assertSafePackagePath("/abs/path")).toThrow(PackagePathError);
    expect(() => assertSafePackagePath("not-approved.txt")).toThrow(
      PackagePathError,
    );

    await expect(
      canonicalInventory([
        entry("manifest.json", "a"),
        entry("manifest.json", "b"),
      ]),
    ).rejects.toThrow(/duplicate_path/);
  });

  it("hashes inventory lines deterministically", async () => {
    const a = entry("manifest.json", "A");
    const b = entry("preview.jpg", "B");
    const forward = await payloadDigest([a, b]);
    const reverse = await payloadDigest([b, a]);
    expect(forward).toBe(reverse);

    const inventory = await canonicalInventory([b, a]);
    const manual = await sha256Hex(
      new TextEncoder().encode(
        inventory.map((e) => `${e.path}\t${e.size}\t${e.sha256}\n`).join(""),
      ),
    );
    expect(forward).toBe(manual);
  });
});
