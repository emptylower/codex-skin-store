import { describe, expect, it } from "vitest";

import { inspectMedia } from "~/domain/assets/media-policy";
import {
  gif,
  jpeg,
  png,
  pngWithTrailingHtml,
  svgBytes,
  webp,
  zipBytes,
} from "../helpers/media";

describe("inspectMedia", () => {
  it.each([
    [png(1920, 1080), "image/png"],
    [jpeg(1920, 1080), "image/jpeg"],
    [webp(1920, 1080), "image/webp"],
  ] as const)("accepts a valid static container", (bytes, mime) => {
    expect(inspectMedia(bytes, bytes.length)).toMatchObject({
      mime,
      width: 1920,
      height: 1080,
      frames: 1,
      mediaType: "static",
    });
  });

  it.each([
    [svgBytes, "unsupported_signature"],
    [zipBytes, "unsupported_signature"],
    [png(8192, 8192), "decoded_pixel_limit"],
    [pngWithTrailingHtml(), "container_trailing_bytes"],
  ] as const)("rejects hostile bytes", (bytes, code) => {
    expect(() => inspectMedia(bytes, bytes.length)).toThrowError(
      expect.objectContaining({ code }),
    );
  });

  it("rejects empty and oversized sources", () => {
    expect(() => inspectMedia(new Uint8Array(0), 0)).toThrowError(
      expect.objectContaining({ code: "source_empty" }),
    );
    expect(() =>
      inspectMedia(png(10, 10), 25_000_001),
    ).toThrowError(expect.objectContaining({ code: "source_too_large" }));
  });

  it("rejects dimensions above the per-side cap", () => {
    const bytes = png(8193, 100);
    expect(() => inspectMedia(bytes, bytes.length)).toThrowError(
      expect.objectContaining({ code: "dimension_limit" }),
    );
  });

  it("accepts a single-frame GIF as static and multi-frame as animated", () => {
    const single = gif(32, 32, 1);
    expect(inspectMedia(single, single.length)).toMatchObject({
      mime: "image/gif",
      mediaType: "static",
      frames: 1,
    });

    const multi = gif(32, 32, 3);
    expect(inspectMedia(multi, multi.length)).toMatchObject({
      mime: "image/gif",
      mediaType: "animated",
      frames: 3,
    });
  });

  it("stores objectBytes and ignores extra buffer capacity past the declared length", () => {
    const image = png(64, 64);
    const padded = new Uint8Array(image.length + 32);
    padded.set(image);
    const inspected = inspectMedia(padded, image.length);
    expect(inspected.objectBytes).toBe(image.length);
    expect(inspected).toMatchObject({
      mime: "image/png",
      width: 64,
      height: 64,
      mediaType: "static",
    });
  });
});
