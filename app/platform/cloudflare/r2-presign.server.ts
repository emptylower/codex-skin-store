import { AwsClient } from "aws4fetch";

import type {
  ObjectPresigner,
  PresignPutInput,
  PresignPutResult,
} from "~/platform/ports";

const SOURCES_BUCKET = "codex-skin-store-sources";
const DEFAULT_EXPIRES_SECONDS = 600;

export type R2PresignEnv = {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
};

/**
 * Presign exact-key PUTs into the private SOURCES quarantine prefix.
 * Metadata carries upload-id and expected-bytes for completion verification.
 */
export function createR2Presigner(env: R2PresignEnv): ObjectPresigner {
  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });

  return {
    async signPut(input: PresignPutInput): Promise<PresignPutResult> {
      const expires = input.expiresSeconds ?? DEFAULT_EXPIRES_SECONDS;
      const encodedKey = input.key
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
      const url = new URL(
        `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${SOURCES_BUCKET}/${encodedKey}`,
      );
      url.searchParams.set("X-Amz-Expires", String(expires));

      const headers = new Headers({
        "content-type": input.contentType,
        "x-amz-meta-upload-id": input.uploadId,
        "x-amz-meta-expected-bytes": String(input.expectedBytes),
      });

      const signed = await client.sign(url, {
        method: "PUT",
        headers,
        aws: { signQuery: true, allHeaders: true },
      });

      const signedHeaders: Record<string, string> = {};
      signed.headers.forEach((value, key) => {
        // Host is fixed by the URL; browsers set Content-Length themselves.
        if (key.toLowerCase() === "host") return;
        signedHeaders[key] = value;
      });

      return {
        url: signed.url,
        headers: signedHeaders,
      };
    },
  };
}
