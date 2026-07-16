/**
 * Programmatic minimal valid image fixtures for media-policy tests.
 * Containers are complete (with PNG CRCs) so walkContainer and image-size agree.
 */

const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** CRC-32 (ISO 3309 / PNG) over type+data bytes. */
function crc32(bytes: Uint8Array): number {
  let c = 0xffff_ffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c ^= bytes[i]!;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb8_8320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffff_ffff) >>> 0;
}

function u32be(n: number): Uint8Array {
  return new Uint8Array([
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ]);
}

function u16be(n: number): Uint8Array {
  return new Uint8Array([(n >>> 8) & 0xff, n & 0xff]);
}

function u16le(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = concat(typeBytes, data);
  const crc = u32be(crc32(body));
  return concat(u32be(data.length), body, crc);
}

/** Minimal PNG: signature + IHDR + IEND (no IDAT; dimensions still parseable). */
export function png(width: number, height: number): Uint8Array {
  const ihdr = new Uint8Array(13);
  ihdr.set(u32be(width), 0);
  ihdr.set(u32be(height), 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  return concat(
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IEND", new Uint8Array(0)),
  );
}

/** Minimal JPEG: SOI + JFIF APP0 + SOF0 (baseline) + EOI. */
export function jpeg(width: number, height: number): Uint8Array {
  // image-size requires APP0/JFIF before it will accept SOF dimensions.
  const app0 = concat(
    new Uint8Array([0xff, 0xe0]),
    u16be(16),
    new TextEncoder().encode("JFIF\0"),
    new Uint8Array([1, 1, 0, 0, 1, 0, 1, 0, 0]),
  );
  // SOF0 segment length = 8 + 3 * components = 17
  const sof0 = concat(
    new Uint8Array([0xff, 0xc0]),
    u16be(17),
    new Uint8Array([8]), // precision
    u16be(height),
    u16be(width),
    new Uint8Array([
      3, // components
      1,
      0x11,
      0, // Y
      2,
      0x11,
      0, // Cb
      3,
      0x11,
      0, // Cr
    ]),
  );
  return concat(
    new Uint8Array([0xff, 0xd8]), // SOI
    app0,
    sof0,
    new Uint8Array([0xff, 0xd9]), // EOI
  );
}

/** Minimal WebP: RIFF/WEBP + VP8X with canvas size. */
export function webp(width: number, height: number): Uint8Array {
  // VP8X payload: flags(4) + width-1(3 LE) + height-1(3 LE)
  const wMinus = width - 1;
  const hMinus = height - 1;
  const vp8xPayload = new Uint8Array([
    0x00,
    0x00,
    0x00,
    0x00,
    wMinus & 0xff,
    (wMinus >>> 8) & 0xff,
    (wMinus >>> 16) & 0xff,
    hMinus & 0xff,
    (hMinus >>> 8) & 0xff,
    (hMinus >>> 16) & 0xff,
  ]);
  const vp8xChunk = concat(
    new TextEncoder().encode("VP8X"),
    u32le(vp8xPayload.length),
    vp8xPayload,
  );
  // RIFF size = 4 (WEBP) + vp8xChunk length
  const riffSize = 4 + vp8xChunk.length;
  return concat(
    new TextEncoder().encode("RIFF"),
    u32le(riffSize),
    new TextEncoder().encode("WEBP"),
    vp8xChunk,
  );
}

function u32le(n: number): Uint8Array {
  return new Uint8Array([
    n & 0xff,
    (n >>> 8) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 24) & 0xff,
  ]);
}

/** Minimal single-frame GIF89a with logical screen + trailer. */
export function gif(width: number, height: number, frames = 1): Uint8Array {
  const header = concat(
    new TextEncoder().encode("GIF89a"),
    u16le(width),
    u16le(height),
    new Uint8Array([0x00, 0x00, 0x00]), // packed (no GCT), bg, aspect
  );

  const parts: Uint8Array[] = [header];
  for (let i = 0; i < frames; i += 1) {
    // Graphic Control Extension (optional but fine) + Image Descriptor + minimal LZW
    const gce = new Uint8Array([
      0x21, 0xf9, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    const imageDesc = concat(
      new Uint8Array([0x2c]),
      u16le(0),
      u16le(0),
      u16le(width),
      u16le(height),
      new Uint8Array([0x00]), // no local color table
    );
    // Minimal image data: LZW min code size + one sub-block + terminator
    const imageData = new Uint8Array([0x02, 0x02, 0x44, 0x01, 0x00]);
    parts.push(gce, imageDesc, imageData);
  }
  parts.push(new Uint8Array([0x3b])); // trailer
  return concat(...parts);
}

export const svgBytes = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
);

/** Local file header signature only — enough to fail magic detection. */
export const zipBytes = new Uint8Array([
  0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

/** Valid PNG with trailing HTML (polyglot / polyfill attack surface). */
export function pngWithTrailingHtml(width = 64, height = 64): Uint8Array {
  const base = png(width, height);
  const trailing = new TextEncoder().encode("<html><script>alert(1)</script>");
  return concat(base, trailing);
}
