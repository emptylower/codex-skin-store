import {
  extensionFor,
  kindForMime,
  MAX_IMAGES_INPUT_BYTES,
  MAX_PREPARED_BYTES,
  MAX_PREVIEW_BYTES,
  MediaError,
  type FocalPoint,
  type MediaInspection,
  type MediaMime,
  type PreparedStaticMedia,
  PREVIEW_HEIGHT,
  PREVIEW_QUALITY_LADDER,
  PREVIEW_WIDTH,
} from "~/domain/assets/media-types";
import type { ReencodeLargeSource } from "./photon.server";

export type PrepareStaticMediaDeps = {
  images: ImagesBinding;
  /** When null, large sources fail with prepared_too_large / decode_failed. */
  reencodeLargeSource: ReencodeLargeSource | null;
};

export type PrepareStaticMediaOptions = {
  focal: FocalPoint;
};

/**
 * Validate a static PNG/JPEG/WebP source with Cloudflare Images and produce
 * a prepared background + preview JPEG (quality ladder, cover crop).
 *
 * Sources above 16 MB prepared limit or 20 MB Images input are re-encoded via
 * Photon (WebP) first, then re-validated with Images.
 */
export async function prepareStaticMedia(
  deps: PrepareStaticMediaDeps,
  bytes: Uint8Array,
  inspection: MediaInspection,
  options: PrepareStaticMediaOptions,
): Promise<PreparedStaticMedia> {
  if (inspection.mediaType !== "static") {
    throw new MediaError("decode_failed", "expected_static_media");
  }
  if (
    inspection.mime !== "image/png" &&
    inspection.mime !== "image/jpeg" &&
    inspection.mime !== "image/webp"
  ) {
    throw new MediaError("decode_failed", "static_mime_not_supported");
  }

  let prepared = bytes;
  let preparedMime: MediaMime = inspection.mime;
  let preparedWidth = inspection.width;
  let preparedHeight = inspection.height;

  const needsReencode =
    prepared.byteLength > MAX_PREPARED_BYTES ||
    prepared.byteLength > MAX_IMAGES_INPUT_BYTES;

  if (needsReencode) {
    if (!deps.reencodeLargeSource) {
      throw new MediaError(
        prepared.byteLength > MAX_PREPARED_BYTES
          ? "prepared_too_large"
          : "decode_failed",
        "photon_reencode_unavailable",
      );
    }
    prepared = await deps.reencodeLargeSource(prepared, inspection);
    if (prepared.byteLength > MAX_PREPARED_BYTES) {
      throw new MediaError("prepared_too_large");
    }
    preparedMime = "image/webp";
  }

  await validateWithImages(deps.images, prepared, {
    expectedMime: preparedMime,
    width: preparedWidth,
    height: preparedHeight,
  });

  // After photon re-encode, dimensions should match inspection; keep for asset meta.
  const preview = await renderPreviewJpeg(deps.images, prepared, options.focal);

  const kind = kindForMime(preparedMime);
  if (!kind) throw new MediaError("decode_failed", "unknown_prepared_mime");

  return {
    background: {
      bytes: prepared,
      mime: preparedMime,
      extension: extensionFor(kind),
      width: preparedWidth,
      height: preparedHeight,
    },
    preview: {
      bytes: preview,
      mime: "image/jpeg",
      extension: "jpg",
    },
  };
}

async function validateWithImages(
  images: ImagesBinding,
  prepared: Uint8Array,
  expected: { expectedMime: MediaMime; width: number; height: number },
): Promise<void> {
  let info: ImageInfoResponse;
  try {
    info = await images.info(streamFrom(prepared));
  } catch (err) {
    throw new MediaError(
      "decode_failed",
      err instanceof Error ? err.message : "images_info_failed",
    );
  }

  if (info.format === "image/svg+xml") {
    throw new MediaError("decode_failed", "svg_rejected");
  }
  if (!("width" in info) || !("height" in info)) {
    throw new MediaError("decode_failed", "images_info_incomplete");
  }
  if (info.format !== expected.expectedMime) {
    throw new MediaError("decode_failed", "images_format_mismatch");
  }
  if (info.width !== expected.width || info.height !== expected.height) {
    throw new MediaError("decode_failed", "images_dimension_mismatch");
  }
}

async function renderPreviewJpeg(
  images: ImagesBinding,
  prepared: Uint8Array,
  focal: FocalPoint,
): Promise<Uint8Array> {
  const x = clamp01(focal.x);
  const y = clamp01(focal.y);

  for (const quality of PREVIEW_QUALITY_LADDER) {
    try {
      const output = await images
        .input(streamFrom(prepared))
        .transform({
          width: PREVIEW_WIDTH,
          height: PREVIEW_HEIGHT,
          fit: "cover",
          gravity: { x, y, mode: "box-center" },
        })
        .output({ format: "image/jpeg", quality, anim: false });

      const preview = await readBytes(output.image());
      if (preview.byteLength <= MAX_PREVIEW_BYTES) {
        return preview;
      }
    } catch (err) {
      if (err instanceof MediaError) throw err;
      throw new MediaError(
        "decode_failed",
        err instanceof Error ? err.message : "images_transform_failed",
      );
    }
  }

  throw new MediaError("preview_too_large");
}

function streamFrom(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function readBytes(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function createImagesBinding(images: ImagesBinding): ImagesBinding {
  return images;
}
