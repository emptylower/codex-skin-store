export const UNIQUENESS_ALGORITHM_VERSION = 1;

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "in",
  "for",
  "on",
  "with",
  "is",
  "are",
  "this",
  "that",
  "from",
  "by",
  "as",
  "at",
  "it",
  "be",
  "你",
  "我",
  "的",
  "了",
  "和",
  "是",
  "在",
  "与",
]);

export function tokenizeMainCopy(text: string): Set<string> {
  const normalized = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/gi, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
  return new Set(normalized);
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Uniqueness score = 1 - max Jaccard similarity vs sibling main-copy tokens.
 * Stores algorithm version and compared landing IDs for review evidence.
 */
export function computeUniquenessEvidence(options: {
  mainCopy: string;
  siblings: Array<{ id: string; mainCopy: string }>;
}): {
  score: number;
  comparedLandingIds: string[];
  algorithmVersion: number;
  maxSimilarity: number;
} {
  const selfTokens = tokenizeMainCopy(options.mainCopy);
  let maxSimilarity = 0;
  const comparedLandingIds: string[] = [];

  for (const sibling of options.siblings) {
    const sim = jaccardSimilarity(
      selfTokens,
      tokenizeMainCopy(sibling.mainCopy),
    );
    comparedLandingIds.push(sibling.id);
    if (sim > maxSimilarity) maxSimilarity = sim;
  }

  const score = Math.max(0, Math.min(1, 1 - maxSimilarity));
  return {
    score,
    comparedLandingIds,
    algorithmVersion: UNIQUENESS_ALGORITHM_VERSION,
    maxSimilarity,
  };
}
