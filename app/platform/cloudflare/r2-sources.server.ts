import type {
  MoveQuarantineToSourceInput,
  SourceObjectHead,
  SourceObjectStore,
  SourcePutOptions,
} from "~/platform/ports";

/**
 * SOURCES R2 adapter for quarantine head/delete during upload completion
 * and quarantine → immutable source promotion during package build.
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

    async get(key: string): Promise<Uint8Array | null> {
      const object = await bucket.get(key);
      if (!object) return null;
      return new Uint8Array(await object.arrayBuffer());
    },

    async put(
      key: string,
      body: Uint8Array,
      options?: SourcePutOptions,
    ): Promise<void> {
      await bucket.put(key, body, {
        httpMetadata: {
          contentType: options?.httpMetadata?.contentType,
          contentDisposition: "attachment",
          cacheControl: "private, no-store",
        },
        customMetadata: options?.customMetadata,
      });
    },

    async moveQuarantineToSource(
      input: MoveQuarantineToSourceInput,
    ): Promise<void> {
      const existing = await bucket.head(input.sourceKey);
      if (existing) {
        const existingSha = existing.customMetadata?.sha256;
        if (existingSha === input.sha256) {
          // Already promoted; best-effort quarantine cleanup.
          try {
            await bucket.delete(input.quarantineKey);
          } catch {
            // ignore
          }
          return;
        }
        throw new Error(
          `source_collision:${input.sourceKey}:existing=${existingSha ?? ""}:expected=${input.sha256}`,
        );
      }

      const quarantine = await bucket.get(input.quarantineKey);
      if (!quarantine) {
        // Quarantine already gone — require destination present.
        const dest = await bucket.head(input.sourceKey);
        if (!dest) {
          throw new Error(`quarantine_missing:${input.quarantineKey}`);
        }
        return;
      }

      const body = new Uint8Array(await quarantine.arrayBuffer());
      await bucket.put(input.sourceKey, body, {
        httpMetadata: {
          contentType: input.contentType,
          contentDisposition: "attachment",
          cacheControl: "private, no-store",
        },
        customMetadata: { sha256: input.sha256 },
      });

      const verified = await bucket.head(input.sourceKey);
      if (
        !verified ||
        verified.size !== body.byteLength ||
        verified.customMetadata?.sha256 !== input.sha256
      ) {
        throw new Error(`source_verification_failed:${input.sourceKey}`);
      }

      try {
        await bucket.delete(input.quarantineKey);
      } catch {
        // ignore
      }
    },
  };
}
