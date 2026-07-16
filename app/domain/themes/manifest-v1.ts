import { z } from "zod";

import {
  MACOS_TARGET,
  WINDOWS_TARGET,
  resolveEmitPlatforms,
  targetsForPlatforms,
  type Platform,
} from "~/domain/themes/compatibility";

const lowercaseSha256 = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "sha256_must_be_lowercase_hex");

export const assetSchema = z.object({
  filename: z.string().min(1),
  mime: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sha256: lowercaseSha256,
});

export type ManifestAsset = z.infer<typeof assetSchema>;

export const manifestV1Schema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,79}$/),
  slug: z.string(),
  version: z.number().int().positive(),
  localized: z.object({
    sourceLocale: z.enum(["en", "zh-hans"]),
    name: z.string(),
    description: z.string(),
  }),
  creator: z.object({ id: z.string(), handle: z.string() }),
  license: z.object({
    id: z.enum(["CC0-1.0", "CC-BY-4.0", "PERSONAL-REDISTRIBUTION-1.0"]),
    attribution: z.string(),
    sourceUrl: z.string(),
  }),
  platforms: z.array(z.enum(["macos", "windows"])),
  compatibilityTargets: z.array(z.enum([MACOS_TARGET, WINDOWS_TARGET])),
  appearance: z.enum(["light", "dark"]),
  mediaType: z.enum(["static", "animated"]),
  colors: z.object({
    accent: z.string(),
    secondary: z.string(),
    highlight: z.string(),
  }),
  focalPoint: z.object({ x: z.number(), y: z.number() }),
  assets: z.object({ background: assetSchema, preview: assetSchema }),
  generatedAt: z.string().datetime(),
});

export type ManifestV1 = z.infer<typeof manifestV1Schema>;

export type BuildManifestInput = {
  id: string;
  slug: string;
  version: number;
  sourceLocale: "en" | "zh-hans";
  name: string;
  description: string;
  creator: { id: string; handle: string };
  license: "CC0-1.0" | "CC-BY-4.0" | "PERSONAL-REDISTRIBUTION-1.0";
  attribution: string;
  sourceUrl: string;
  platforms: Platform[];
  appearance: "light" | "dark";
  mediaType: "static" | "animated";
  accent: string;
  secondary: string;
  highlight: string;
  focalPoint: { x: number; y: number };
  assets: {
    background: ManifestAsset;
    preview: ManifestAsset;
  };
  generatedAt: string;
};

/**
 * Build a neutral store manifest. Animated media never emits macOS.
 */
export function buildManifest(input: BuildManifestInput): ManifestV1 {
  const platforms = resolveEmitPlatforms({
    platforms: input.platforms,
    mediaType: input.mediaType,
  });
  const compatibilityTargets = targetsForPlatforms(platforms);

  const manifest: ManifestV1 = {
    schemaVersion: 1,
    id: input.id,
    slug: input.slug,
    version: input.version,
    localized: {
      sourceLocale: input.sourceLocale,
      name: input.name,
      description: input.description,
    },
    creator: input.creator,
    license: {
      id: input.license,
      attribution: input.attribution,
      sourceUrl: input.sourceUrl,
    },
    platforms,
    compatibilityTargets,
    appearance: input.appearance,
    mediaType: input.mediaType,
    colors: {
      accent: input.accent,
      secondary: input.secondary,
      highlight: input.highlight,
    },
    focalPoint: input.focalPoint,
    assets: input.assets,
    generatedAt: input.generatedAt,
  };

  return manifestV1Schema.parse(manifest);
}

/** Recursively sort object keys and serialize with a trailing newline. */
export function serializeManifest(value: unknown): string {
  return `${JSON.stringify(sortKeysDeep(value))}\n`;
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortKeysDeep(obj[key]);
    }
    return sorted;
  }
  return value;
}
