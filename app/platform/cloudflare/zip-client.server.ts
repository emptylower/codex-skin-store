import { makeZip } from "client-zip";

import { validatePackageEntries } from "~/domain/themes/package-inventory";
import {
  entryName,
  type StoreZipWriter,
  type ZipEntry,
  type ZipEntryBody,
} from "~/platform/cloudflare/zip-types";

function toStream(body: ZipEntryBody): ReadableStream<Uint8Array> | Uint8Array {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (typeof body === "string") {
    return new TextEncoder().encode(body);
  }
  if (body instanceof Blob) {
    return body.stream();
  }
  return body;
}

/**
 * client-zip Store-only writer. client-zip emits method 0 (stored) by design.
 */
export const clientZipWriter: StoreZipWriter = {
  implementation: "client-zip",
  stream(entries) {
    return makeZip(
      (async function* () {
        const collected: ZipEntry[] = [];
        for await (const entry of entries as AsyncIterable<ZipEntry>) {
          collected.push(entry);
        }
        validatePackageEntries(collected);
        // Deterministic entry order for stable archive digests.
        collected.sort((a, b) => entryName(a).localeCompare(entryName(b)));

        for (const e of collected) {
          const name = entryName(e);
          yield {
            name,
            size: e.size,
            lastModified: e.lastModified,
            input: toStream(e.body),
          };
        }
      })(),
    );
  },
};
