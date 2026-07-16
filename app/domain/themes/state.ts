export type ThemeVisibility = "draft" | "public" | "unlisted" | "hidden";
export type ThemeModerationStatus = "clean" | "flagged" | "removed";
export type ThemePackageStatus = "processing" | "ready" | "failed";

export type ThemeState = {
  visibility: ThemeVisibility;
  moderationStatus: ThemeModerationStatus;
  packageStatus: ThemePackageStatus;
};

/**
 * Download eligibility for the public package endpoint.
 * Public + not removed + package ready. Flagged themes remain downloadable
 * until moderation escalates to removed.
 */
export function canDownload(theme: ThemeState): boolean {
  return (
    theme.visibility === "public" &&
    theme.moderationStatus !== "removed" &&
    theme.packageStatus === "ready"
  );
}

/**
 * Marketplace listing eligibility: public, not removed, and package ready.
 */
export function isPubliclyListable(theme: ThemeState): boolean {
  return (
    theme.visibility === "public" &&
    theme.moderationStatus !== "removed" &&
    theme.packageStatus === "ready"
  );
}
