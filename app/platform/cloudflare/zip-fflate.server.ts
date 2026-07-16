import { Zip, ZipPassThrough } from "fflate";

import { validatePackageEntries } from "~/domain/themes/package-inventory";
import {
  entryName,
  type StoreZipWriter,
  type ZipEntry,
  type ZipEntryBody,
} from "~/platform/cloudflare/zip-types";

/** Single UTC timestamp applied to every entry for archive stability. */
export const PACKAGE_ZIP_MTIME = new Date("2020-01-01T00:00:00.000Z");

async function bodyToUint8Array(body: ZipEntryBody): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof Blob) {
    return new Uint8Array(await body.arrayBuffer());
  }
  const buf = await new Response(body).arrayBuffer();
  return new Uint8Array(buf);
}

async function pumpStoreEntries(
  zip: Zip,
  entries: ZipEntry[],
): Promise<void> {
  for (const entry of entries) {
    const name = entryName(entry);
    const file = new ZipPassThrough(name);
    file.mtime = PACKAGE_ZIP_MTIME;
    zip.add(file);

    const bytes = await bodyToUint8Array(entry.body);
    // Push in chunks so large assets don't monopolize the event loop.
    const chunkSize = 64 * 1024;
    if (bytes.byteLength === 0) {
      file.push(new Uint8Array(0), true);
      continue;
    }
    for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
      const end = Math.min(offset + chunkSize, bytes.byteLength);
      const chunk = bytes.subarray(offset, end);
      const final = end === bytes.byteLength;
      file.push(chunk, final);
    }
  }
  zip.end();
}

/**
 * fflate Store-only writer using ZipPassThrough (compression method 0).
 */
export const fflateWriter: StoreZipWriter = {
  implementation: "fflate",
  stream(entries) {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        const zip = new Zip((error, chunk, final) => {
          if (error) {
            controller.error(error);
            return;
          }
          if (chunk) controller.enqueue(chunk);
          if (final) controller.close();
        });

        void (async () => {
          try {
            const collected: ZipEntry[] = [];
            for await (const entry of entries as AsyncIterable<ZipEntry>) {
              collected.push(entry);
            }
            validatePackageEntries(collected);
            collected.sort((a, b) => entryName(a).localeCompare(entryName(b)));
            await pumpStoreEntries(zip, collected);
          } catch (err) {
            controller.error(err);
          }
        })();
      },
    });
  },
};
