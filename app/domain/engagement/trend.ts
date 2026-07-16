/**
 * Deterministic marketplace trend score.
 * recentUniqueDeliveries: distinct user delivery actions in the recent window.
 * recentFavorites: favorites created in the recent window.
 * ageDays: whole days since theme creation (or publish).
 */
export function computeTrendScore(input: {
  recentUniqueDeliveries: number;
  recentFavorites: number;
  ageDays: number;
}): number {
  const deliveries = Math.max(0, Math.floor(input.recentUniqueDeliveries));
  const favorites = Math.max(0, Math.floor(input.recentFavorites));
  const ageDays = Number.isFinite(input.ageDays) ? input.ageDays : 999;
  return deliveries * 5 + favorites * 2 + Math.max(0, 14 - ageDays);
}

export function ageDaysFromCreated(createdAtMs: number, nowMs: number): number {
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(nowMs)) return 999;
  const ms = Math.max(0, nowMs - createdAtMs);
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}
