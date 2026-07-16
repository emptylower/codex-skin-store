/**
 * Require an exact Origin match against the request URL origin.
 * Used by JSON mutation endpoints that must not accept cross-site posts.
 */
export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("Origin");
  if (!origin) {
    throw new Response("Origin required", { status: 403 });
  }
  const expected = new URL(request.url).origin;
  if (origin !== expected) {
    throw new Response("Cross-origin request blocked", { status: 403 });
  }
}
