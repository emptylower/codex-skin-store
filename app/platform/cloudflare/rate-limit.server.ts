export type AbuseAction = "comment" | "report";

export interface AbuseGate {
  check(input: {
    action: AbuseAction;
    userId: string;
    ipHash: string;
    turnstileToken?: string;
  }): Promise<{ allowed: boolean; challengeRequired: boolean }>;
}

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const LIMITS: Record<AbuseAction, number> = {
  comment: 20,
  report: 10,
};

/**
 * HMAC-SHA256 hex of IP with a versioned key. Never store raw IP.
 */
export async function hashIp(
  ip: string,
  secret: string,
  keyVersion = "v1",
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`${keyVersion}:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(ip),
  );
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function clientIpFromRequest(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "0.0.0.0"
  );
}

/**
 * Local D1 window counter. Production may add Turnstile when challengeRequired.
 */
export function createD1AbuseGate(
  db: D1Database,
  options?: { now?: () => number },
): AbuseGate {
  return {
    async check(input) {
      const now = options?.now?.() ?? Date.now();
      const windowStart = now - (now % WINDOW_MS);
      const limit = LIMITS[input.action];
      const bucketKey = `${input.action}:${input.userId}:${input.ipHash}`;

      await db
        .prepare(
          `INSERT INTO rate_limit_windows (bucket_key, window_start, count)
           VALUES (?, ?, 1)
           ON CONFLICT(bucket_key, window_start)
           DO UPDATE SET count = count + 1`,
        )
        .bind(bucketKey, windowStart)
        .run();

      const row = await db
        .prepare(
          `SELECT count FROM rate_limit_windows
           WHERE bucket_key = ? AND window_start = ?`,
        )
        .bind(bucketKey, windowStart)
        .first<{ count: number }>();

      const count = row?.count ?? 1;
      if (count > limit) {
        return {
          allowed: false,
          challengeRequired: count > limit * 2,
        };
      }

      // Soft challenge flag near the limit for Turnstile adapters.
      return {
        allowed: true,
        challengeRequired: count > Math.floor(limit * 0.8),
      };
    },
  };
}
