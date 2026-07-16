/** Shared Store-only ZIP writer types. */

export type ZipEntryBody =
  | Uint8Array
  | ArrayBuffer
  | ReadableStream<Uint8Array>
  | Blob
  | string;

export type ZipEntry = {
  /** Package-relative path (forward slashes). Also accepted as `name`. */
  path?: string;
  name?: string;
  size: number;
  lastModified: Date | number;
  body: ZipEntryBody;
};

export type StoreZipWriterImplementation = "client-zip" | "fflate";

export type StoreZipWriter = {
  implementation: StoreZipWriterImplementation;
  stream: (
    entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>,
  ) => ReadableStream<Uint8Array>;
};

export function entryName(entry: ZipEntry): string {
  return entry.path ?? entry.name ?? "";
}
