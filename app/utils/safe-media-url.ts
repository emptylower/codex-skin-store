/**
 * Allow only site-relative paths and https URLs for theme media.
 * Rejects protocol-relative URLs, http, data:, javascript:, etc.
 */
export function safeMediaUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return url.toString();
  } catch {
    return null;
  }
  return null;
}
