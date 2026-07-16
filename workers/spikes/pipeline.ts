/**
 * Isolated pipeline spike worker (Task 6 compatibility gate).
 *
 * LOCAL SCAFFOLD ONLY — do not deploy without explicit approval.
 * Remote steps:
 *   npx wrangler deploy --config wrangler.spike.jsonc --env staging
 *   gh workflow run pipeline-spike.yml -f spike_url=...
 *
 * Defaults remain conservative: ENABLE_GIF_UPLOADS=false, ZIP_WRITER=fflate.
 */

import { makeZip } from "client-zip";
import { Zip, ZipPassThrough } from "fflate";

type SpikeEnv = {
  ENABLE_GIF_UPLOADS?: string;
  ZIP_WRITER?: string;
};

const FIXED_MTIME = new Date("2020-01-01T00:00:00.000Z");

async function fflateStoreZip(
  files: Array<{ name: string; data: Uint8Array }>,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  await new Promise<void>((resolve, reject) => {
    const zip = new Zip((err, chunk, final) => {
      if (err) {
        reject(err);
        return;
      }
      if (chunk) chunks.push(chunk);
      if (final) resolve();
    });
    for (const file of files) {
      const entry = new ZipPassThrough(file.name);
      entry.mtime = FIXED_MTIME;
      zip.add(entry);
      entry.push(file.data, true);
    }
    zip.end();
  });
  let total = 0;
  for (const c of chunks) total += c.byteLength;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

async function clientZipStore(
  files: Array<{ name: string; data: Uint8Array }>,
): Promise<Uint8Array> {
  const stream = makeZip(
    files.map((f) => ({
      name: f.name,
      lastModified: FIXED_MTIME,
      size: f.data.byteLength,
      input: f.data,
    })),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Minimal spike: emit static store archives from both writers and report hashes.
 * GIF/anim:false transform is intentionally stubbed until the approved gate run.
 */
export default {
  async fetch(request: Request, env: SpikeEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/spike" && url.pathname !== "/") {
      return new Response("not found", { status: 404 });
    }

    const enableGif = env.ENABLE_GIF_UPLOADS === "true";
    const zipWriter = env.ZIP_WRITER ?? "fflate";

    const files = [
      {
        name: "manifest.json",
        data: new TextEncoder().encode(
          JSON.stringify({ schemaVersion: 1, spike: "static" }),
        ),
      },
      {
        name: "preview.jpg",
        data: new TextEncoder().encode("SPIKE-PREVIEW"),
      },
      {
        name: "background.png",
        data: new TextEncoder().encode("SPIKE-BACKGROUND"),
      },
    ];

    const [fflateBytes, clientBytes] = await Promise.all([
      fflateStoreZip(files),
      clientZipStore(files),
    ]);

    const body = {
      approvalRequired: true,
      note:
        "Remote deploy and workflow are approval-gated. Local scaffold only.",
      flags: {
        ENABLE_GIF_UPLOADS: enableGif,
        ZIP_WRITER: zipWriter,
        defaults: {
          ENABLE_GIF_UPLOADS: false,
          ZIP_WRITER: "fflate",
        },
      },
      gif: {
        enabled: enableGif,
        status: enableGif
          ? "not_implemented_in_scaffold"
          : "disabled_until_gate_passes",
      },
      archives: {
        fflate: {
          bytes: fflateBytes.byteLength,
          sha256: await sha256Hex(fflateBytes),
        },
        "client-zip": {
          bytes: clientBytes.byteLength,
          sha256: await sha256Hex(clientBytes),
        },
      },
    };

    return new Response(JSON.stringify(body, null, 2) + "\n", {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  },
};
