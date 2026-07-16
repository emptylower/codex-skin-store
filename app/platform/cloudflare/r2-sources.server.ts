import type { SourceObjectHead, SourceObjectStore } from "~/platform/ports";

/**
 * SOURCES R2 adapter for quarantine head/delete during upload completion.
 */
export function createSourceObjectStore(bucket: R2Bucket): SourceObjectStore {
  return {
    async head(key: string): Promise<SourceObjectHead | null> {
      const object = await bucket.head(key);
      if (!object) return null;
      return {
        size: object.size,
        etag: object.etag,
        customMetadata: object.customMetadata ?? {},
      };
    },

    async delete(key: string): Promise<void> {
      await bucket.delete(key);
    },
  };
}
