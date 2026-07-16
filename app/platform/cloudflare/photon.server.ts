import {
  MediaError,
  type MediaInspection,
  MAX_PREPARED_BYTES,
} from "~/domain/assets/media-types";

/**
 * Port for re-encoding large static sources that exceed Images / prepared limits.
 * Production uses @cf-wasm/photon; tests inject a mock.
 */
export type ReencodeLargeSource = (
  bytes: Uint8Array,
  inspection: MediaInspection,
) => Promise<Uint8Array>;

/**
 * Decode with Photon, verify dimensions, encode WebP, free native memory.
 * Used when source is 20–25 MB (Images input cap) or above the 16 MB prepared limit.
 */
export async function reencodeWithPhoton(
  bytes: Uint8Array,
  inspection: MediaInspection,
): Promise<Uint8Array> {
  // Dynamic import keeps unit/worker tests that mock the port free of WASM load cost.
  const { PhotonImage } = await import("@cf-wasm/photon");

  let image: InstanceType<typeof PhotonImage> | null = null;
  try {
    image = PhotonImage.new_from_byteslice(bytes);
    const width = image.get_width();
    const height = image.get_height();
    if (width !== inspection.width || height !== inspection.height) {
      throw new MediaError("decode_failed", "photon_dimension_mismatch");
    }
    const webp = image.get_bytes_webp();
    if (webp.byteLength < 1) {
      throw new MediaError("decode_failed", "photon_empty_webp");
    }
    if (webp.byteLength > MAX_PREPARED_BYTES) {
      throw new MediaError("prepared_too_large");
    }
    // Copy out of WASM memory before free().
    return new Uint8Array(webp);
  } catch (err) {
    if (err instanceof MediaError) throw err;
    throw new MediaError(
      "decode_failed",
      err instanceof Error ? err.message : "photon_decode_failed",
    );
  } finally {
    image?.free();
  }
}

export function createPhotonReencoder(): ReencodeLargeSource {
  return reencodeWithPhoton;
}
