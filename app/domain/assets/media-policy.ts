import { imageSize } from "image-size";

import {
  extensionFor,
  MAX_DECODED_PIXELS,
  MAX_GIF_FRAMES,
  MAX_GIF_PIXEL_FRAMES,
  MAX_SIDE_PIXELS,
  MAX_SOURCE_BYTES,
  MediaError,
  type MediaInspection,
  type MediaKind,
  mimeFor,
} from "./media-types";

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/**
 * Pure hostile-media inspection: magic bytes, exact container bounds,
 * and dimension/pixel caps. Does not decode pixels or touch Cloudflare.
 */
export function inspectMedia(
  bytes: Uint8Array,
  objectBytes: number,
): MediaInspection {
  if (objectBytes < 1) throw new MediaError("source_empty");
  if (objectBytes > MAX_SOURCE_BYTES) throw new MediaError("source_too_large");
  // Prefer the declared object size when the buffer is a partial view, but
  // reject when the provided buffer is shorter than the declared length.
  if (bytes.byteLength < objectBytes) {
    throw new MediaError("container_malformed", "buffer_shorter_than_object");
  }
  // Inspect only the declared object length (ignore accidental extra buffer capacity).
  const view = bytes.subarray(0, objectBytes);

  const kind = detectExactMagic(view);
  if (!kind) throw new MediaError("unsupported_signature");

  const terminalOffset = walkContainer(view, kind);
  if (terminalOffset !== objectBytes) {
    throw new MediaError("container_trailing_bytes");
  }

  let width: number | undefined;
  let height: number | undefined;
  try {
    const size = imageSize(view);
    width = size.width;
    height = size.height;
  } catch {
    throw new MediaError("container_malformed", "dimension_parse_failed");
  }

  if (!width || !height) throw new MediaError("dimension_limit");
  if (width > MAX_SIDE_PIXELS || height > MAX_SIDE_PIXELS) {
    throw new MediaError("dimension_limit");
  }
  if (width * height > MAX_DECODED_PIXELS) {
    throw new MediaError("decoded_pixel_limit");
  }

  const frames = kind === "gif" ? countGifFrames(view) : 1;
  if (frames < 1) throw new MediaError("container_malformed", "gif_no_frames");
  if (frames > MAX_GIF_FRAMES || width * height * frames > MAX_GIF_PIXEL_FRAMES) {
    throw new MediaError("gif_frame_limit");
  }

  return {
    mime: mimeFor(kind),
    extension: extensionFor(kind),
    width,
    height,
    frames,
    mediaType: frames > 1 ? "animated" : "static",
    kind,
  };
}

export function detectExactMagic(bytes: Uint8Array): MediaKind | null {
  if (bytes.length >= 8 && matches(bytes, PNG_SIG)) return "png";
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  if (bytes.length >= 6) {
    const h0 = bytes[0];
    const h1 = bytes[1];
    const h2 = bytes[2];
    const h3 = bytes[3];
    const h4 = bytes[4];
    const h5 = bytes[5];
    if (
      h0 === 0x47 &&
      h1 === 0x49 &&
      h2 === 0x46 &&
      h3 === 0x38 &&
      (h4 === 0x37 || h4 === 0x39) &&
      h5 === 0x61
    ) {
      return "gif";
    }
  }
  return null;
}

/**
 * Walk the container and return the exclusive end offset of the valid image.
 * Bounds every length field; throws container_malformed on truncated structures.
 */
export function walkContainer(bytes: Uint8Array, kind: MediaKind): number {
  switch (kind) {
    case "png":
      return walkPng(bytes);
    case "jpeg":
      return walkJpeg(bytes);
    case "webp":
      return walkWebp(bytes);
    case "gif":
      return walkGif(bytes);
  }
}

function walkPng(bytes: Uint8Array): number {
  if (bytes.length < 8 || !matches(bytes, PNG_SIG)) {
    throw new MediaError("container_malformed", "png_signature");
  }
  let offset = 8;
  let sawIend = false;
  while (offset + 12 <= bytes.length) {
    const length = readU32be(bytes, offset);
    const type =
      String.fromCharCode(bytes[offset + 4]!) +
      String.fromCharCode(bytes[offset + 5]!) +
      String.fromCharCode(bytes[offset + 6]!) +
      String.fromCharCode(bytes[offset + 7]!);
    // Chunk total = 4 length + 4 type + data + 4 crc
    if (length > bytes.length - offset - 12) {
      throw new MediaError("container_malformed", "png_chunk_oob");
    }
    offset += 12 + length;
    if (type === "IEND") {
      sawIend = true;
      break;
    }
  }
  if (!sawIend) throw new MediaError("container_malformed", "png_missing_iend");
  return offset;
}

function walkJpeg(bytes: Uint8Array): number {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new MediaError("container_malformed", "jpeg_soi");
  }
  let offset = 2;
  while (offset < bytes.length) {
    // Skip fill bytes 0xFF
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) {
      throw new MediaError("container_malformed", "jpeg_truncated");
    }
    const marker = bytes[offset]!;
    offset += 1;

    // Standalone markers without length
    if (marker === 0x00 || marker === 0xff) {
      // not a real marker; continue
      continue;
    }
    if (marker === 0xd9) {
      // EOI
      return offset;
    }
    // RST markers (D0-D7) and TEM (01) have no length
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      continue;
    }
    // SOI should not reappear; treat as malformed if mid-stream
    if (marker === 0xd8) {
      throw new MediaError("container_malformed", "jpeg_nested_soi");
    }

    // Markers with length (including SOS)
    if (offset + 2 > bytes.length) {
      throw new MediaError("container_malformed", "jpeg_length_oob");
    }
    const segLen = readU16be(bytes, offset);
    if (segLen < 2 || offset + segLen > bytes.length) {
      throw new MediaError("container_malformed", "jpeg_segment_oob");
    }
    offset += segLen;

    // After SOS (0xDA), scan entropy-coded data until next marker that is not RSTn/0x00
    if (marker === 0xda) {
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        // Found 0xFF — look ahead for marker
        let k = offset + 1;
        while (k < bytes.length && bytes[k] === 0xff) k += 1;
        if (k >= bytes.length) {
          throw new MediaError("container_malformed", "jpeg_entropy_trunc");
        }
        const m = bytes[k]!;
        if (m === 0x00) {
          // stuffed 0xFF00
          offset = k + 1;
          continue;
        }
        if (m >= 0xd0 && m <= 0xd7) {
          // restart
          offset = k + 1;
          continue;
        }
        // Real marker (including EOI)
        offset = k; // point at marker byte; loop will re-process via outer... but we already consumed 0xFF
        // Adjust: outer expects offset at marker value position after 0xFF skip.
        // Set offset to the 0xFF of this marker.
        offset = k - 1;
        // Ensure we land on 0xFF
        while (offset > 0 && bytes[offset] !== 0xff) offset -= 1;
        break;
      }
      if (offset >= bytes.length) {
        throw new MediaError("container_malformed", "jpeg_missing_eoi");
      }
    }
  }
  throw new MediaError("container_malformed", "jpeg_missing_eoi");
}

function walkWebp(bytes: Uint8Array): number {
  if (bytes.length < 12) {
    throw new MediaError("container_malformed", "webp_short");
  }
  if (
    bytes[0] !== 0x52 ||
    bytes[1] !== 0x49 ||
    bytes[2] !== 0x46 ||
    bytes[3] !== 0x46
  ) {
    throw new MediaError("container_malformed", "webp_riff");
  }
  const riffSize = readU32le(bytes, 4);
  // RIFF size is the number of bytes after the size field (includes "WEBP" + chunks)
  // Total file size = 8 + riffSize
  if (riffSize < 4 || 8 + riffSize > bytes.length) {
    // Allow exact; if riffSize claims more than available → malformed
    // If riffSize claims less, terminal is 8+riffSize (trailing handled by caller)
  }
  if (8 + riffSize > bytes.length) {
    throw new MediaError("container_malformed", "webp_riff_oob");
  }
  if (
    bytes[8] !== 0x57 ||
    bytes[9] !== 0x45 ||
    bytes[10] !== 0x42 ||
    bytes[11] !== 0x50
  ) {
    throw new MediaError("container_malformed", "webp_fourcc");
  }

  // Walk chunks inside RIFF for basic integrity (optional but safer)
  let offset = 12;
  const end = 8 + riffSize;
  while (offset + 8 <= end) {
    const chunkSize = readU32le(bytes, offset + 4);
    const padded = chunkSize + (chunkSize & 1); // pad to even
    if (offset + 8 + padded > end) {
      throw new MediaError("container_malformed", "webp_chunk_oob");
    }
    offset += 8 + padded;
  }
  if (offset !== end) {
    // leftover unaligned bytes inside declared RIFF size
    throw new MediaError("container_malformed", "webp_chunk_residue");
  }
  return end;
}

function walkGif(bytes: Uint8Array): number {
  if (bytes.length < 13) {
    throw new MediaError("container_malformed", "gif_short");
  }
  // Header + Logical Screen Descriptor already validated by magic
  let offset = 13;
  const packed = bytes[10]!;
  const hasGct = (packed & 0x80) !== 0;
  if (hasGct) {
    const gctSize = 3 * (1 << ((packed & 0x07) + 1));
    if (offset + gctSize > bytes.length) {
      throw new MediaError("container_malformed", "gif_gct_oob");
    }
    offset += gctSize;
  }

  while (offset < bytes.length) {
    const b = bytes[offset]!;
    if (b === 0x3b) {
      // trailer
      return offset + 1;
    }
    if (b === 0x21) {
      // extension
      if (offset + 2 > bytes.length) {
        throw new MediaError("container_malformed", "gif_ext_trunc");
      }
      offset += 2; // introducer + label
      offset = skipGifSubBlocks(bytes, offset);
      continue;
    }
    if (b === 0x2c) {
      // image descriptor
      if (offset + 10 > bytes.length) {
        throw new MediaError("container_malformed", "gif_img_trunc");
      }
      const localPacked = bytes[offset + 9]!;
      offset += 10;
      if ((localPacked & 0x80) !== 0) {
        const lctSize = 3 * (1 << ((localPacked & 0x07) + 1));
        if (offset + lctSize > bytes.length) {
          throw new MediaError("container_malformed", "gif_lct_oob");
        }
        offset += lctSize;
      }
      // LZW min code size
      if (offset >= bytes.length) {
        throw new MediaError("container_malformed", "gif_lzw_trunc");
      }
      offset += 1;
      offset = skipGifSubBlocks(bytes, offset);
      continue;
    }
    throw new MediaError("container_malformed", "gif_unknown_block");
  }
  throw new MediaError("container_malformed", "gif_missing_trailer");
}

function skipGifSubBlocks(bytes: Uint8Array, start: number): number {
  let offset = start;
  while (offset < bytes.length) {
    const size = bytes[offset]!;
    offset += 1;
    if (size === 0) return offset;
    if (offset + size > bytes.length) {
      throw new MediaError("container_malformed", "gif_subblock_oob");
    }
    offset += size;
  }
  throw new MediaError("container_malformed", "gif_subblock_trunc");
}

export function countGifFrames(bytes: Uint8Array): number {
  if (bytes.length < 13) return 0;
  let offset = 13;
  const packed = bytes[10]!;
  if ((packed & 0x80) !== 0) {
    offset += 3 * (1 << ((packed & 0x07) + 1));
  }
  let frames = 0;
  while (offset < bytes.length) {
    const b = bytes[offset]!;
    if (b === 0x3b) break;
    if (b === 0x21) {
      if (offset + 2 > bytes.length) break;
      offset += 2;
      try {
        offset = skipGifSubBlocks(bytes, offset);
      } catch {
        break;
      }
      continue;
    }
    if (b === 0x2c) {
      if (offset + 10 > bytes.length) break;
      const localPacked = bytes[offset + 9]!;
      offset += 10;
      if ((localPacked & 0x80) !== 0) {
        offset += 3 * (1 << ((localPacked & 0x07) + 1));
      }
      if (offset >= bytes.length) break;
      offset += 1; // LZW
      try {
        offset = skipGifSubBlocks(bytes, offset);
      } catch {
        break;
      }
      frames += 1;
      continue;
    }
    break;
  }
  return frames;
}

function matches(bytes: Uint8Array, sig: readonly number[]): boolean {
  for (let i = 0; i < sig.length; i += 1) {
    if (bytes[i] !== sig[i]) return false;
  }
  return true;
}

function readU32be(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  );
}

function readU16be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! << 8) | bytes[offset + 1]!) >>> 0;
}

function readU32le(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}
