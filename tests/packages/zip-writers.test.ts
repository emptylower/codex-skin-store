import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";

import {
  PackagePathError,
  canonicalInventory,
  payloadDigest,
  sha256Hex,
} from "~/domain/themes/package-inventory";
import {
  PACKAGE_ZIP_MTIME,
  clientZipWriter,
  fflateWriter,
  streamZipBytes,
  type ZipEntry,
} from "~/platform/cloudflare/zip.server";

function textBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function packageEntries(): { artifacts: Array<{ path: string; size: number; bytes: Uint8Array }>; zipEntries: ZipEntry[] } {
  const files = [
    { path: "manifest.json", text: '{"schemaVersion":1,"id":"theme-1"}' },
    { path: "preview.jpg", text: "JPEG-BYTES" },
    { path: "background.png", text: "PNG-BYTES" },
    {
      path: "adapters/macos/theme.json",
      text: '{"schemaVersion":1,"colors":{"panelAlt":"#111"}}',
    },
    {
      path: "adapters/windows/theme.json",
      text: '{"schemaVersion":1,"layout":{"previewPosition":"center"}}',
    },
    { path: "INSTALL.md", text: "# Install" },
    { path: "install-prompt.md", text: "PROMPT-BODY" },
  ];

  const artifacts = files.map((f) => {
    const bytes = textBytes(f.text);
    return { path: f.path, size: bytes.byteLength, bytes };
  });

  const zipEntries: ZipEntry[] = artifacts.map((a) => ({
    path: a.path,
    size: a.size,
    lastModified: PACKAGE_ZIP_MTIME,
    body: a.bytes,
  }));

  return { artifacts, zipEntries };
}

function openZip(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  const entries = Object.entries(files).map(([name, data]) => {
    // Local file header starts at variable offsets; parse compression method
    // by scanning central directory isn't free via unzipSync, so read raw.
    return { name, data, size: data.byteLength };
  });

  // Parse Store method from central directory records.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const methods: Array<{ name: string; compressionMethod: number }> = [];
  let offset = 0;
  while (offset + 4 <= bytes.byteLength) {
    const sig = view.getUint32(offset, true);
    if (sig === 0x02014b50) {
      // central directory file header
      const compressionMethod = view.getUint16(offset + 10, true);
      const nameLen = view.getUint16(offset + 28, true);
      const extraLen = view.getUint16(offset + 30, true);
      const commentLen = view.getUint16(offset + 32, true);
      const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLen);
      const name = new TextDecoder().decode(nameBytes);
      methods.push({ name, compressionMethod });
      offset += 46 + nameLen + extraLen + commentLen;
      continue;
    }
    if (sig === 0x06054b50) break;
    offset += 1;
  }

  return {
    entries: methods.map((m) => {
      const data = files[m.name];
      return {
        name: m.name,
        compressionMethod: m.compressionMethod,
        size: data?.byteLength ?? 0,
      };
    }),
    files,
  };
}

describe.each([
  ["fflate", fflateWriter],
  ["client-zip", clientZipWriter],
] as const)("%s store-only zip writer", (label, writer) => {
  it("excludes prompt from payload digest and stores every entry", async () => {
    const { artifacts, zipEntries } = packageEntries();
    const inventory = await canonicalInventory(artifacts);
    expect(inventory.map((x) => x.path)).not.toContain("install-prompt.md");

    const bytes = await streamZipBytes(writer, zipEntries);
    const zip = openZip(bytes);

    expect(zip.entries.every((e) => e.compressionMethod === 0)).toBe(true);

    const expectedPaths = [...zipEntries.map((e) => e.path!)].sort();
    expect(zip.entries.map((e) => e.name).sort()).toEqual(expectedPaths);

    const archiveHash = await sha256Hex(bytes);
    const payload = await payloadDigest(artifacts);
    expect(archiveHash).not.toBe(payload);
    expect(archiveHash).toMatch(/^[a-f0-9]{64}$/);

    // install-prompt.md is present in the archive even though excluded from payload.
    expect(zip.files["install-prompt.md"]).toBeTruthy();
  });

  it(`rejects unsafe paths (${label})`, async () => {
    await expect(
      streamZipBytes(writer, [
        {
          path: "../evil.json",
          size: 1,
          lastModified: PACKAGE_ZIP_MTIME,
          body: textBytes("x"),
        },
      ]),
    ).rejects.toThrow(PackagePathError);

    await expect(
      streamZipBytes(writer, [
        {
          path: "foo\\bar.json",
          size: 1,
          lastModified: PACKAGE_ZIP_MTIME,
          body: textBytes("x"),
        },
      ]),
    ).rejects.toThrow(PackagePathError);

    await expect(
      streamZipBytes(writer, [
        {
          path: "manifest.json",
          size: 1,
          lastModified: PACKAGE_ZIP_MTIME,
          body: textBytes("a"),
        },
        {
          path: "manifest.json",
          size: 1,
          lastModified: PACKAGE_ZIP_MTIME,
          body: textBytes("b"),
        },
      ]),
    ).rejects.toThrow(/duplicate_path/);
  });
});
