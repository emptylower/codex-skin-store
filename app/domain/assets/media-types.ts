export type MediaKind = "png" | "jpeg" | "webp" | "gif";

export type MediaMime =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/gif";

export type MediaExtension = "png" | "jpg" | "webp" | "gif";

export type MediaType = "static" | "animated";

export type MediaErrorCode =
  | "source_empty"
  | "source_too_large"
  | "unsupported_signature"
  | "container_trailing_bytes"
  | "container_malformed"
  | "dimension_limit"
  | "decoded_pixel_limit"
  | "gif_frame_limit"
  | "decode_failed"
  | "preview_too_large"
  | "prepared_too_large";

export class MediaError extends Error {
  readonly code: MediaErrorCode;

  constructor(code: MediaErrorCode, message?: string) {
    super(message ?? code);
    this.name = "MediaError";
    this.code = code;
  }
}

export type MediaInspection = {
  mime: MediaMime;
  extension: MediaExtension;
  width: number;
  height: number;
  frames: number;
  mediaType: MediaType;
  kind: MediaKind;
};

export type FocalPoint = {
  x: number;
  y: number;
};

export type PreparedMediaAsset = {
  bytes: Uint8Array;
  mime: MediaMime;
  extension: MediaExtension;
  width: number;
  height: number;
};

export type PreparedStaticMedia = {
  background: PreparedMediaAsset;
  preview: {
    bytes: Uint8Array;
    mime: "image/jpeg";
    extension: "jpg";
  };
};

/** Source object size hard cap (bytes). */
export const MAX_SOURCE_BYTES = 25_000_000;
/** Prepared background hard cap (bytes). */
export const MAX_PREPARED_BYTES = 16_000_000;
/** Preview JPEG target/hard cap (bytes). */
export const MAX_PREVIEW_BYTES = 250_000;
/** Cloudflare Images input cap (bytes); larger sources need Photon first. */
export const MAX_IMAGES_INPUT_BYTES = 20_000_000;
/** Max pixels on either side. */
export const MAX_SIDE_PIXELS = 8192;
/** Max decoded width * height for a single frame. */
export const MAX_DECODED_PIXELS = 16_777_216;
/** Max GIF frames. */
export const MAX_GIF_FRAMES = 300;
/** Max width * height * frames for GIF. */
export const MAX_GIF_PIXEL_FRAMES = 50_331_648;

export const PREVIEW_QUALITY_LADDER = [82, 74, 66, 58, 50] as const;
export const PREVIEW_WIDTH = 1600;
export const PREVIEW_HEIGHT = 1000;

export function mimeFor(kind: MediaKind): MediaMime {
  switch (kind) {
    case "png":
      return "image/png";
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
  }
}

export function extensionFor(kind: MediaKind): MediaExtension {
  switch (kind) {
    case "png":
      return "png";
    case "jpeg":
      return "jpg";
    case "webp":
      return "webp";
    case "gif":
      return "gif";
  }
}

export function kindForMime(mime: string): MediaKind | null {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpeg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return null;
  }
}
