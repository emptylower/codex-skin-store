import { describe, expect, it } from "vitest";
import { unzipSync, zipSync } from "fflate";

import {
  assertSafePackagePath,
  payloadDigest,
  sha256Hex,
  type ArtifactEntry,
} from "~/domain/themes/package-inventory";
import { INSTALL_PROHIBITION } from "~/domain/themes/install-prompt-v1";

/**
 * Golden package compatibility rules for macOS / Windows / dual packages.
 * Manual smoke (Explorer, Archive Utility, 7-Zip) remains required before release
 * if the streaming ZIP path declares ZIP64 capability.
 */

const FORBIDDEN_EXTENSIONS = [
  ".exe",
  ".bat",
  ".cmd",
  ".ps1",
  ".sh",
  ".msi",
  ".dll",
  ".so",
  ".dylib",
];

function buildGoldenEntries(platform: "macos" | "windows" | "dual") {
  const files: Record<string, Uint8Array> = {
    "manifest.json": new TextEncoder().encode(
      JSON.stringify({
        schemaVersion: 1,
        name: "Golden Theme",
        platforms:
          platform === "dual"
            ? ["macos", "windows"]
            : platform === "macos"
              ? ["macos"]
              : ["windows"],
      }),
    ),
    "INSTALL.md": new TextEncoder().encode(
      `# Install\n\n${INSTALL_PROHIBITION}\nUse Codex Desktop only.\n`,
    ),
    "install-prompt.md": new TextEncoder().encode(
      "Store-generated install prompt. Do not paste uploader text.\n",
    ),
    "preview.jpg": new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    "background.png": new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  };

  if (platform === "macos" || platform === "dual") {
    files["adapters/macos/theme.json"] = new TextEncoder().encode(
      JSON.stringify({ target: "macos", version: 1 }),
    );
  }
  if (platform === "windows" || platform === "dual") {
    files["adapters/windows/theme.json"] = new TextEncoder().encode(
      JSON.stringify({ target: "windows", version: 1 }),
    );
  }

  return files;
}

function toArtifacts(files: Record<string, Uint8Array>): ArtifactEntry[] {
  return Object.entries(files).map(([path, bytes]) => ({
    path,
    size: bytes.byteLength,
    bytes,
  }));
}

function assertCaseFoldUnique(paths: string[]) {
  const seen = new Set<string>();
  for (const p of paths) {
    const key = p.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`case_fold_collision:${p}`);
    }
    seen.add(key);
  }
}

function assertNoExecutables(paths: string[]) {
  for (const p of paths) {
    const lower = p.toLowerCase();
    for (const ext of FORBIDDEN_EXTENSIONS) {
      if (lower.endsWith(ext)) {
        throw new Error(`executable_forbidden:${p}`);
      }
    }
  }
}

describe("runtime package compatibility (golden rules)", () => {
  for (const platform of ["macos", "windows", "dual"] as const) {
    it(`validates ${platform} golden inventory rules`, async () => {
      const files = buildGoldenEntries(platform);
      const paths = Object.keys(files);

      for (const p of paths) {
        assertSafePackagePath(p);
      }
      assertCaseFoldUnique(paths);
      assertNoExecutables(paths);

      const installPrompt = new TextDecoder().decode(
        files["install-prompt.md"],
      );
      expect(installPrompt.toLowerCase()).not.toContain(
        "ignore previous instructions",
      );
      expect(new TextDecoder().decode(files["INSTALL.md"])).toContain(
        INSTALL_PROHIBITION,
      );

      const digest = await payloadDigest(toArtifacts(files));
      expect(digest).toMatch(/^[a-f0-9]{64}$/);

      const zipped = zipSync(files);
      const unzipped = unzipSync(zipped);
      expect(Object.keys(unzipped).sort()).toEqual(paths.sort());

      for (const path of paths) {
        const a = await sha256Hex(files[path]!);
        const b = await sha256Hex(unzipped[path]!);
        expect(a).toBe(b);
      }
    });
  }

  it("documents manual archive smoke requirements when ZIP64 may be used", () => {
    const manualChecks = [
      "Windows Explorer extract",
      "macOS Archive Utility extract",
      "7-Zip test archive",
    ];
    expect(manualChecks).toHaveLength(3);
  });
});
