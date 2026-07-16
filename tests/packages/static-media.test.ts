import { describe, expect, it, vi } from "vitest";

import type { MediaInspection } from "~/domain/assets/media-types";
import { inspectMedia } from "~/domain/assets/media-policy";
import { prepareStaticMedia } from "~/platform/cloudflare/images.server";
import { jpeg, png, webp } from "../helpers/media";

function streamFrom(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function readStream(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

function createMockImages(opts?: {
  previewBytes?: number;
  infoFormat?: string;
  infoWidth?: number;
  infoHeight?: number;
}) {
  const previewSize = opts?.previewBytes ?? 12_000;
  const preview = new Uint8Array(previewSize);
  preview[0] = 0xff;
  preview[1] = 0xd8;

  return {
    info: vi.fn(async (stream: ReadableStream<Uint8Array>) => {
      const bytes = await readStream(stream);
      return {
        format: opts?.infoFormat ?? "image/png",
        fileSize: bytes.length,
        width: opts?.infoWidth ?? 1920,
        height: opts?.infoHeight ?? 1080,
      };
    }),
    input: vi.fn((_stream: ReadableStream<Uint8Array>) => ({
      transform: vi.fn(() => ({
        output: vi.fn(async () => ({
          image: () => streamFrom(preview),
          response: () => new Response(preview),
          contentType: () => "image/jpeg",
        })),
      })),
    })),
    hosted: {} as ImagesBinding["hosted"],
  } satisfies ImagesBinding;
}

describe("prepareStaticMedia", () => {
  it("validates with Images and produces a preview under the size cap", async () => {
    const bytes = png(1920, 1080);
    const inspected = inspectMedia(bytes, bytes.length) as MediaInspection;
    const images = createMockImages({ infoFormat: "image/png" });

    const result = await prepareStaticMedia(
      { images, reencodeLargeSource: null },
      bytes,
      inspected,
      { focal: { x: 0.5, y: 0.4 } },
    );

    expect(result.background.mime).toBe("image/png");
    expect(result.background.bytes.byteLength).toBe(bytes.byteLength);
    expect(result.preview.mime).toBe("image/jpeg");
    expect(result.preview.bytes.byteLength).toBeLessThanOrEqual(250_000);
    expect(images.info).toHaveBeenCalled();
    expect(images.input).toHaveBeenCalled();
  });

  it("accepts jpeg and webp sources with matching Images format", async () => {
    for (const [bytes, format] of [
      [jpeg(800, 600), "image/jpeg"],
      [webp(800, 600), "image/webp"],
    ] as const) {
      const inspected = inspectMedia(bytes, bytes.length);
      const images = createMockImages({
        infoFormat: format,
        infoWidth: 800,
        infoHeight: 600,
      });
      const result = await prepareStaticMedia(
        { images, reencodeLargeSource: null },
        bytes,
        inspected,
        { focal: { x: 0.5, y: 0.5 } },
      );
      expect(result.background.mime).toBe(format);
      expect(result.preview.bytes.byteLength).toBeGreaterThan(0);
    }
  });

  it("re-encodes oversized sources via the photon port before Images", async () => {
    const bytes = png(640, 480);
    const inspected = inspectMedia(bytes, bytes.length);
    // Force large path via declared objectBytes (not accidental buffer capacity).
    const huge = new Uint8Array(16_000_001);
    huge.set(bytes);

    const reencoded = webp(640, 480);
    const reencodeLargeSource = vi.fn(async () => reencoded);
    const images = createMockImages({
      infoFormat: "image/webp",
      infoWidth: 640,
      infoHeight: 480,
    });

    const result = await prepareStaticMedia(
      { images, reencodeLargeSource },
      huge,
      {
        ...inspected,
        width: 640,
        height: 480,
        mime: "image/png",
        objectBytes: 16_000_001,
      },
      { focal: { x: 0.5, y: 0.5 } },
    );

    expect(reencodeLargeSource).toHaveBeenCalled();
    expect(result.background.mime).toBe("image/webp");
    expect(result.background.bytes.byteLength).toBe(reencoded.byteLength);
  });

  it("processes only inspection.objectBytes when the buffer is larger", async () => {
    const bytes = png(320, 240);
    const inspected = inspectMedia(bytes, bytes.length);
    const padded = new Uint8Array(bytes.length + 4096);
    padded.set(bytes);
    const images = createMockImages({
      infoFormat: "image/png",
      infoWidth: 320,
      infoHeight: 240,
    });

    const result = await prepareStaticMedia(
      { images, reencodeLargeSource: null },
      padded,
      inspected,
      { focal: { x: 0.5, y: 0.5 } },
    );

    expect(result.background.bytes.byteLength).toBe(inspected.objectBytes);
    expect(result.background.bytes.byteLength).toBe(bytes.byteLength);
    expect(images.info).toHaveBeenCalledOnce();
  });

  it("rejects when Images reports SVG or dimension mismatch", async () => {
    const bytes = png(100, 100);
    const inspected = inspectMedia(bytes, bytes.length);
    const images = createMockImages({
      infoFormat: "image/svg+xml",
      infoWidth: 100,
      infoHeight: 100,
    });

    await expect(
      prepareStaticMedia(
        { images, reencodeLargeSource: null },
        bytes,
        inspected,
        { focal: { x: 0.5, y: 0.5 } },
      ),
    ).rejects.toMatchObject({ code: "decode_failed" });
  });

  it("rejects when preview cannot fit under 250KB across quality ladder", async () => {
    const bytes = png(1920, 1080);
    const inspected = inspectMedia(bytes, bytes.length);
    const images = createMockImages({
      infoFormat: "image/png",
      previewBytes: 300_000,
    });

    await expect(
      prepareStaticMedia(
        { images, reencodeLargeSource: null },
        bytes,
        inspected,
        { focal: { x: 0.5, y: 0.5 } },
      ),
    ).rejects.toMatchObject({ code: "preview_too_large" });
  });
});
