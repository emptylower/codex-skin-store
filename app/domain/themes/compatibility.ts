/**
 * Compatibility targets and pinned runtime commits used by package generation.
 *
 * SHA pins below are placeholders until the staging compatibility spike lands
 * real validated commits. Documented as intentional pins so adapters stay
 * frozen relative to known good runtimes.
 */

export const MACOS_TARGET = "original-macos-v1" as const;
export const WINDOWS_TARGET = "forge-windows-v1" as const;

export const COMPATIBILITY_TARGETS = [MACOS_TARGET, WINDOWS_TARGET] as const;
export type CompatibilityTarget = (typeof COMPATIBILITY_TARGETS)[number];

export type Platform = "macos" | "windows";

/** Placeholder pin: original macOS Dream Skin runtime (Task 6 gate). */
export const PINNED_MACOS_RUNTIME_COMMIT =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

/** Placeholder pin: Forge Windows theme validator/runtime (Task 6 gate). */
export const PINNED_WINDOWS_RUNTIME_COMMIT =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;

export const TARGET_RUNTIME_PINS = {
  [MACOS_TARGET]: {
    platform: "macos" as const,
    commit: PINNED_MACOS_RUNTIME_COMMIT,
    label: "Original macOS v1",
  },
  [WINDOWS_TARGET]: {
    platform: "windows" as const,
    commit: PINNED_WINDOWS_RUNTIME_COMMIT,
    label: "Forge Windows v1",
  },
} as const;

export function platformForTarget(target: CompatibilityTarget): Platform {
  return TARGET_RUNTIME_PINS[target].platform;
}

export function targetsForPlatforms(
  platforms: readonly Platform[],
): CompatibilityTarget[] {
  const out: CompatibilityTarget[] = [];
  if (platforms.includes("macos")) out.push(MACOS_TARGET);
  if (platforms.includes("windows")) out.push(WINDOWS_TARGET);
  return out;
}

/**
 * GIF / animated media never emits macOS adapters or targets.
 */
export function resolveEmitPlatforms(input: {
  platforms: readonly Platform[];
  mediaType: "static" | "animated";
}): Platform[] {
  if (input.mediaType === "animated") {
    return input.platforms.filter((p) => p === "windows");
  }
  return [...input.platforms];
}
