import type { ThemeVisibility } from "./state";

const MAX_SLUG_LENGTH = 60;

/**
 * Normalize free-form title/input into a stable ASCII slug.
 * Strips diacritics, lowercases, collapses non-alphanumeric runs to `-`,
 * trims hyphens, and caps at 60 characters.
 */
export function normalizeSlug(input: string): string {
  const ascii = input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

  const slug = ascii
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");

  if (!slug) {
    throw new Error("Slug is empty after normalization");
  }

  return slug;
}

/**
 * Build `base-n` while keeping the full candidate ≤ MAX_SLUG_LENGTH.
 * Truncates the base (and trailing hyphens) when the suffix would overflow.
 */
function candidateWithSuffix(base: string, n: number): string {
  const suffix = `-${n}`;
  const maxBaseLength = MAX_SLUG_LENGTH - suffix.length;
  const truncatedBase = base.slice(0, maxBaseLength).replace(/-+$/g, "");

  if (!truncatedBase) {
    throw new Error(
      `Unable to fit unique slug suffix for base "${base}" within ${MAX_SLUG_LENGTH} characters`,
    );
  }

  return `${truncatedBase}${suffix}`;
}

/**
 * Resolve a unique slug by trying `base`, then `base-2` … `base-99`.
 * Suffixed candidates are truncated so the full slug never exceeds 60 chars.
 */
export function resolveUniqueSlug(
  base: string,
  exists: (slug: string) => boolean,
): string {
  if (!exists(base)) {
    return base;
  }

  for (let n = 2; n <= 99; n += 1) {
    const candidate = candidateWithSuffix(base, n);
    if (!exists(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to resolve unique slug for base "${base}"`);
}

/**
 * Published slugs are immutable. A theme may change its slug only while it
 * remains an unpublished draft (no version, visibility still draft).
 */
export function canChangeSlug(theme: {
  visibility: ThemeVisibility;
  currentVersion: number | null;
}): boolean {
  if (theme.currentVersion != null) {
    return false;
  }

  return theme.visibility === "draft";
}
