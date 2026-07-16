#!/usr/bin/env tsx
/**
 * Offline theme package validator.
 *
 * Usage:
 *   npx tsx scripts/check-package.ts <archive.zip> [expected.json]
 *   npm run check:package -- <archive.zip> [expected.json]
 *
 * expected.json (optional):
 *   { "payloadDigest"?: string, "archiveDigest"?: string, "platforms"?: ("macos"|"windows")[] }
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { unzipSync } from "fflate";
import { z } from "zod";

import {
  APPROVED_PACKAGE_PATHS,
  assertSafePackagePath,
  payloadDigest,
  sha256Hex,
  type ArtifactEntry,
} from "~/domain/themes/package-inventory";
import { manifestV1Schema } from "~/domain/themes/manifest-v1";
import { INSTALL_PROHIBITION } from "~/domain/themes/install-prompt-v1";
import { MACOS_TARGET, WINDOWS_TARGET } from "~/domain/themes/compatibility";

type Expected = {
  payloadDigest?: string;
  archiveDigest?: string;
  platforms?: Array<"macos" | "windows">;
};

class CheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckError";
  }
}

function fail(message: string): never {
  throw new CheckError(message);
}

function parseCentralDirectory(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: Array<{ name: string; compressionMethod: number }> = [];
  let offset = 0;
  while (offset + 4 <= bytes.byteLength) {
    const sig = view.getUint32(offset, true);
    if (sig === 0x02014b50) {
      const compressionMethod = view.getUint16(offset + 10, true);
      const nameLen = view.getUint16(offset + 28, true);
      const extraLen = view.getUint16(offset + 30, true);
      const commentLen = view.getUint16(offset + 32, true);
      const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLen);
      const name = new TextDecoder().decode(nameBytes);
      entries.push({ name, compressionMethod });
      offset += 46 + nameLen + extraLen + commentLen;
      continue;
    }
    if (sig === 0x06054b50) break;
    offset += 1;
  }
  return entries;
}

const macosAdapterSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  name: z.string(),
  brandSubtitle: z.string(),
  tagline: z.string(),
  projectPrefix: z.string(),
  projectLabel: z.string(),
  statusText: z.string(),
  quote: z.string(),
  image: z.string(),
  colors: z.object({
    background: z.string(),
    panel: z.string(),
    panelAlt: z.string(),
    accent: z.string(),
    accentAlt: z.string(),
    secondary: z.string(),
    highlight: z.string(),
    text: z.string(),
    muted: z.string(),
    line: z.string(),
  }),
});

const windowsAdapterSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  name: z.string(),
  description: z.string(),
  image: z.string(),
  preview: z.string(),
  mode: z.enum(["light", "dark"]),
  order: z.number(),
  brand: z.string(),
  palette: z.record(z.string(), z.string()),
  layout: z.object({
    copyAlign: z.string(),
    copyWidth: z.string(),
    heroPosition: z.string(),
    pagePosition: z.string(),
    previewPosition: z.string(),
    bodyBackground: z.string(),
    heroOverlay: z.string(),
    pageOverlay: z.string(),
    homeOverlay: z.string(),
    titleColor: z.string(),
    titleShadow: z.string(),
  }),
});

function isUnsafePrompt(text: string): boolean {
  if (!text.includes(INSTALL_PROHIBITION)) return true;
  if (/```/.test(text)) return true;
  if (/\r/.test(text)) return true;
  return false;
}

export async function checkPackageBytes(
  zipBytes: Uint8Array,
  expected?: Expected,
): Promise<{ payloadDigest: string; archiveDigest: string }> {
  const archiveDigest = await sha256Hex(zipBytes);
  if (expected?.archiveDigest && expected.archiveDigest !== archiveDigest) {
    fail(
      `archive_digest_mismatch:expected=${expected.archiveDigest}:actual=${archiveDigest}`,
    );
  }

  const central = parseCentralDirectory(zipBytes);
  for (const entry of central) {
    if (entry.compressionMethod !== 0) {
      fail(`non_store_entry:${entry.name}:method=${entry.compressionMethod}`);
    }
  }

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zipBytes);
  } catch (err) {
    fail(`unzip_failed:${err instanceof Error ? err.message : String(err)}`);
  }

  const paths = Object.keys(files);
  const seen = new Set<string>();
  for (const path of paths) {
    try {
      assertSafePackagePath(path);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    if (seen.has(path)) fail(`duplicate_path:${path}`);
    seen.add(path);
    if (!APPROVED_PACKAGE_PATHS.has(path)) {
      fail(`unexpected_path:${path}`);
    }
  }

  const artifacts: ArtifactEntry[] = paths.map((path) => {
    const bytes = files[path]!;
    return { path, size: bytes.byteLength, bytes };
  });

  for (const required of [
    "manifest.json",
    "preview.jpg",
    "INSTALL.md",
    "install-prompt.md",
  ]) {
    if (!seen.has(required)) fail(`missing_required:${required}`);
  }

  const bg = paths.filter((p) => p.startsWith("background."));
  if (bg.length !== 1) fail(`background_count:${bg.length}`);

  let manifest: z.infer<typeof manifestV1Schema>;
  try {
    const raw = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
    manifest = manifestV1Schema.parse(raw);
  } catch (err) {
    fail(`manifest_schema:${err instanceof Error ? err.message : String(err)}`);
  }

  const selected = expected?.platforms ?? manifest.platforms;
  if (selected.includes("macos")) {
    if (!seen.has("adapters/macos/theme.json")) {
      fail("missing_selected_adapter:macos");
    }
    try {
      macosAdapterSchema.parse(
        JSON.parse(
          new TextDecoder().decode(files["adapters/macos/theme.json"]),
        ),
      );
    } catch (err) {
      fail(
        `macos_adapter_schema:${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!manifest.compatibilityTargets.includes(MACOS_TARGET)) {
      fail("manifest_missing_macos_target");
    }
  } else if (seen.has("adapters/macos/theme.json")) {
    fail("extra_unselected_adapter:macos");
  }

  if (selected.includes("windows")) {
    if (!seen.has("adapters/windows/theme.json")) {
      fail("missing_selected_adapter:windows");
    }
    try {
      windowsAdapterSchema.parse(
        JSON.parse(
          new TextDecoder().decode(files["adapters/windows/theme.json"]),
        ),
      );
    } catch (err) {
      fail(
        `windows_adapter_schema:${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!manifest.compatibilityTargets.includes(WINDOWS_TARGET)) {
      fail("manifest_missing_windows_target");
    }
  } else if (seen.has("adapters/windows/theme.json")) {
    fail("extra_unselected_adapter:windows");
  }

  const bgPath = bg[0]!;
  const bgBytes = files[bgPath]!;
  const bgSha = await sha256Hex(bgBytes);
  if (manifest.assets.background.sha256 !== bgSha) {
    fail("wrong_file_hash:background");
  }
  if (manifest.assets.background.bytes !== bgBytes.byteLength) {
    fail("wrong_file_size:background");
  }
  const previewBytes = files["preview.jpg"]!;
  const previewSha = await sha256Hex(previewBytes);
  if (manifest.assets.preview.sha256 !== previewSha) {
    fail("wrong_file_hash:preview");
  }

  const computedPayload = await payloadDigest(artifacts);
  if (expected?.payloadDigest && expected.payloadDigest !== computedPayload) {
    fail(
      `payload_digest_mismatch:expected=${expected.payloadDigest}:actual=${computedPayload}`,
    );
  }

  const promptText = new TextDecoder().decode(files["install-prompt.md"]);
  if (isUnsafePrompt(promptText)) {
    fail("unsafe_prompt_text");
  }
  if (!promptText.includes(computedPayload)) {
    fail("prompt_payload_digest_mismatch");
  }

  return { payloadDigest: computedPayload, archiveDigest };
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  if (args.length < 1) {
    console.error("Usage: check-package <archive.zip> [expected.json]");
    process.exit(2);
  }

  const zipPath = resolve(args[0]!);
  const expectedPath = args[1] ? resolve(args[1]) : null;
  const zipBytes = new Uint8Array(readFileSync(zipPath));
  let expected: Expected | undefined;
  if (expectedPath) {
    expected = JSON.parse(readFileSync(expectedPath, "utf8")) as Expected;
  }

  try {
    const result = await checkPackageBytes(zipBytes, expected);
    console.log("package valid");
    console.log(`payloadDigest=${result.payloadDigest}`);
    console.log(`archiveDigest=${result.archiveDigest}`);
  } catch (err) {
    console.error(
      `package invalid: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("check-package.ts") || entry.endsWith("check-package.js")) {
  void main();
}
