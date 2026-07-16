export type ThemeVisibility = "draft" | "public" | "unlisted" | "hidden";
export type ThemeModerationStatus = "clean" | "flagged" | "removed";
export type ThemePackageStatus = "processing" | "ready" | "failed";

export type ThemeState = {
  visibility: ThemeVisibility;
  moderationStatus: ThemeModerationStatus;
  packageStatus: ThemePackageStatus;
};

/**
 * Shared readiness gate for public package download and marketplace listing:
 * public visibility, not removed, and package ready.
 * Flagged themes remain eligible until moderation escalates to removed.
 */
function isPublicReady(theme: ThemeState): boolean {
  return (
    theme.visibility === "public" &&
    theme.moderationStatus !== "removed" &&
    theme.packageStatus === "ready"
  );
}

/** Download eligibility for the public package endpoint. */
export function canDownload(theme: ThemeState): boolean {
  return isPublicReady(theme);
}

/** Marketplace listing eligibility. */
export function isPubliclyListable(theme: ThemeState): boolean {
  return isPublicReady(theme);
}
