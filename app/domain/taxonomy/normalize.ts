/**
 * Static controlled synonym map for taxonomy normalization.
 * Upload-time free-form suggestions are not accepted as canonical values.
 *
 * Keys are pre-normalized lookup tokens (lowercase, collapsed whitespace,
 * hyphen variants folded to spaces). Values are stable ASCII taxonomy keys.
 */
const SYNONYM_ENTRIES: ReadonlyArray<readonly [string, string]> = [
  // Genre example from the product plan
  ["science-fiction", "science-fiction"],
  ["science fiction", "science-fiction"],
  ["sci fi", "science-fiction"],
  ["sci-fi", "science-fiction"],
  ["scifi", "science-fiction"],
  ["科幻", "science-fiction"],

  // style: neon
  ["neon", "neon"],
  ["cyber", "neon"],
  ["glow", "neon"],
  ["synthwave", "neon"],
  ["霓虹", "neon"],
  ["赛博", "neon"],
  ["发光", "neon"],
  ["合成波", "neon"],

  // style: minimal
  ["minimal", "minimal"],
  ["clean", "minimal"],
  ["simple", "minimal"],
  ["sparse", "minimal"],
  ["极简", "minimal"],
  ["干净", "minimal"],
  ["简洁", "minimal"],
  ["留白", "minimal"],

  // style: retro
  ["retro", "retro"],
  ["pixel", "retro"],
  ["arcade", "retro"],
  ["vintage", "retro"],
  ["复古", "retro"],
  ["像素", "retro"],
  ["街机", "retro"],
  ["怀旧", "retro"],

  // style: ink
  ["ink", "ink"],
  ["brush", "ink"],
  ["calligraphy", "ink"],
  ["scroll", "ink"],
  ["水墨", "ink"],
  ["毛笔", "ink"],
  ["书法", "ink"],
  ["卷轴", "ink"],

  // mood: focus
  ["focus", "focus"],
  ["deep work", "focus"],
  ["concentration", "focus"],
  ["专注", "focus"],
  ["深度工作", "focus"],
  ["集中", "focus"],

  // mood: cozy
  ["cozy", "cozy"],
  ["warm", "cozy"],
  ["soft", "cozy"],
  ["homey", "cozy"],
  ["温馨", "cozy"],
  ["温暖", "cozy"],
  ["柔和", "cozy"],
  ["居家", "cozy"],

  // mood: energetic
  ["energetic", "energetic"],
  ["vivid", "energetic"],
  ["bold", "energetic"],
  ["bright", "energetic"],
  ["活力", "energetic"],
  ["鲜明", "energetic"],
  ["大胆", "energetic"],
  ["明亮", "energetic"],

  // mood: calm
  ["calm", "calm"],
  ["serene", "calm"],
  ["quiet", "calm"],
  ["peaceful", "calm"],
  ["平静", "calm"],
  ["宁静", "calm"],
  ["安静", "calm"],
  ["平和", "calm"],

  // mode: dark
  ["dark", "dark"],
  ["night", "dark"],
  ["dim", "dark"],
  ["深色", "dark"],
  ["夜间", "dark"],
  ["暗色", "dark"],

  // mode: light
  ["light", "light"],
  ["day", "light"],
  ["浅色", "light"],
  ["日间", "light"],
];

function foldLookupKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CANONICAL_BY_SYNONYM: ReadonlyMap<string, string> = new Map(
  SYNONYM_ENTRIES.map(([synonym, key]) => [foldLookupKey(synonym), key]),
);

/**
 * Map free-form / synonym input to a controlled taxonomy key.
 * Returns null when the input is unknown (not accepted as canonical).
 */
export function normalizeTaxonomyInput(input: string): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const folded = foldLookupKey(input);
  if (!folded) {
    return null;
  }

  return CANONICAL_BY_SYNONYM.get(folded) ?? null;
}
