import { clientZipWriter } from "~/platform/cloudflare/zip-client.server";
import { fflateWriter } from "~/platform/cloudflare/zip-fflate.server";
import type {
  StoreZipWriter,
  StoreZipWriterImplementation,
  ZipEntry,
} from "~/platform/cloudflare/zip-types";

export type { StoreZipWriter, StoreZipWriterImplementation, ZipEntry };
export { clientZipWriter } from "~/platform/cloudflare/zip-client.server";
export {
  fflateWriter,
  PACKAGE_ZIP_MTIME,
} from "~/platform/cloudflare/zip-fflate.server";

/**
 * Default remains fflate until the deployed staging spike (Task 6 gate) proves
 * client-zip archive stability. Do not flip production without approval.
 */
export function resolveZipWriter(
  flag: string | undefined | null = "fflate",
): StoreZipWriter {
  if (flag === "client-zip") return clientZipWriter;
  return fflateWriter;
}

export async function streamZipBytes(
  writer: StoreZipWriter,
  entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>,
): Promise<Uint8Array> {
  const stream = writer.stream(entries);
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Hash final ZIP bytes. Prefer DigestStream in Workers when available.
 */
export async function archiveDigestFromStream(
  stream: ReadableStream<Uint8Array>,
): Promise<{ bytes: Uint8Array; archiveDigest: string }> {
  // Cloudflare Workers expose crypto.DigestStream; fall back to subtle.digest.
  const DigestStreamCtor = (
    crypto as unknown as {
      DigestStream?: new (algorithm: string) => TransformStream<
        Uint8Array,
        Uint8Array
      > & {
        digest: Promise<ArrayBuffer>;
      };
    }
  ).DigestStream;

  if (DigestStreamCtor) {
    const digester = new DigestStreamCtor("SHA-256");
    const [forHash, forBytes] = stream.tee();
    const hashDone = forHash.pipeTo(digester.writable);
    const bytes = new Uint8Array(await new Response(forBytes).arrayBuffer());
    await hashDone;
    const digestBuf = await digester.digest;
    const archiveDigest = [...new Uint8Array(digestBuf)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return { bytes, archiveDigest };
  }

  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  const digestBuf = await crypto.subtle.digest("SHA-256", bytes);
  const archiveDigest = [...new Uint8Array(digestBuf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { bytes, archiveDigest };
}
