import { z } from "zod";

import {
  COMPATIBILITY_TARGETS,
  MACOS_TARGET,
  WINDOWS_TARGET,
  type CompatibilityTarget,
} from "~/domain/themes/compatibility";

export {
  COMPATIBILITY_TARGETS,
  MACOS_TARGET,
  WINDOWS_TARGET,
  type CompatibilityTarget,
};

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const creatorInputSchema = z
  .object({
    sourceLocale: z.enum(["en", "zh-hans"]),
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().min(20).max(500),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(64),
    license: z.enum(["CC0-1.0", "CC-BY-4.0", "PERSONAL-REDISTRIBUTION-1.0"]),
    attribution: z.string().trim().max(200),
    sourceUrl: z.union([
      z.literal(""),
      z
        .string()
        .url()
        .refine((v) => /^https?:/.test(v), {
          message: "source_url_must_be_http_or_https",
        }),
    ]),
    platforms: z
      .array(z.enum(["macos", "windows"]))
      .min(1)
      .max(2),
    appearance: z.enum(["light", "dark"]),
    mediaType: z.enum(["static", "animated"]),
    accent: hex,
    secondary: hex,
    highlight: hex,
    focalPoint: z.object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
    }),
    compatibilityTargets: z
      .array(z.enum([MACOS_TARGET, WINDOWS_TARGET]))
      .min(1)
      .max(2),
    rightsDeclared: z.literal(true),
  })
  .superRefine((v, ctx) => {
    if (
      v.mediaType === "animated" &&
      (v.platforms.length !== 1 || v.platforms[0] !== "windows")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["platforms"],
        message: "animated_requires_windows_only",
      });
    }

    if (v.license === "CC-BY-4.0" && !v.attribution) {
      ctx.addIssue({
        code: "custom",
        path: ["attribution"],
        message: "attribution_required",
      });
    }

    // Platforms and compatibility targets should stay aligned.
    const hasMacos = v.platforms.includes("macos");
    const hasWindows = v.platforms.includes("windows");
    const hasMacTarget = v.compatibilityTargets.includes(MACOS_TARGET);
    const hasWinTarget = v.compatibilityTargets.includes(WINDOWS_TARGET);

    if (hasMacos !== hasMacTarget || hasWindows !== hasWinTarget) {
      ctx.addIssue({
        code: "custom",
        path: ["compatibilityTargets"],
        message: "compatibility_targets_must_match_platforms",
      });
    }
  });

export type CreatorInput = z.infer<typeof creatorInputSchema>;

export function parseCreatorInput(input: unknown): CreatorInput {
  return creatorInputSchema.parse(input);
}
