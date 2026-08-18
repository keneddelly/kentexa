/**
 * PriceExpressionParser — deterministic Tanzanian price-shorthand extraction
 * Place at: src/ai/price-expression-parser.util.ts
 *
 * Pure, synchronous, zero AI dependency. Used as the baseline for
 * AiSearchParserService.parse() so price filtering keeps working even when
 * the LLM is unavailable/misconfigured or simply misses shorthand like
 * "120k" — the AI result only overrides a field here when it actually
 * returned a non-null value for it.
 *
 * Handles: "120k", "120,000", "100000", "laki moja"/"moja laki" (x100,000),
 * "nusu laki" (50,000), "elfu tano"/"tano elfu" (x1,000), and range phrases
 * "chini ya X"/"under X" (max), "zaidi ya X"/"juu ya X"/"above X" (min),
 * "X mpaka Y"/"kati ya X na Y"/"between X and Y" (min+max). A bare amount
 * with no range phrase defaults to maxPrice — matching how Tanzanians
 * actually say it ("kinasa sauti cha 120k" means "up to 120k", a budget
 * ceiling, not an exact-match price).
 */

export interface ParsedPriceExpression {
  minPrice: number | null;
  maxPrice: number | null;
}

const SWAHILI_NUMBER_WORDS: Record<string, number> = {
  moja: 1,
  mbili: 2,
  tatu: 3,
  nne: 4,
  tano: 5,
  sita: 6,
  saba: 7,
  nane: 8,
  tisa: 9,
  kumi: 10,
};
const NUMBER_WORD_PATTERN = Object.keys(SWAHILI_NUMBER_WORDS).join('|');

function wordOrDigitToNumber(token: string): number | null {
  const t = token.toLowerCase().trim();
  if (SWAHILI_NUMBER_WORDS[t] != null) return SWAHILI_NUMBER_WORDS[t];
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Finds the first parseable amount anywhere in a short text span and
// returns its value in TZS, or null if nothing recognizable is present.
function parseSingleAmount(text: string): number | null {
  const s = text.toLowerCase();

  // "nusu laki" — half of 100,000, checked before the general laki pattern.
  if (/\bnusu\s+laki\b/.test(s)) return 50000;

  // "k" shorthand — "120k", "120.5k"
  const kMatch = s.match(/\b(\d+(?:\.\d+)?)\s*k\b/);
  if (kMatch) return Math.round(Number(kMatch[1]) * 1000);

  // "laki" (hundred-thousand) — "laki moja" or "moja laki" or "laki 2"
  const lakiMatch = s.match(
    new RegExp(`\\blaki\\s+(${NUMBER_WORD_PATTERN}|\\d+)\\b`, 'i'),
  ) || s.match(new RegExp(`\\b(${NUMBER_WORD_PATTERN}|\\d+)\\s+laki\\b`, 'i'));
  if (lakiMatch) {
    const mult = wordOrDigitToNumber(lakiMatch[1]);
    if (mult != null) return mult * 100000;
  }

  // "elfu" (thousand) — "elfu tano" or "tano elfu" or "elfu 5"
  const elfuMatch = s.match(
    new RegExp(`\\belfu\\s+(${NUMBER_WORD_PATTERN}|\\d+)\\b`, 'i'),
  ) || s.match(new RegExp(`\\b(${NUMBER_WORD_PATTERN}|\\d+)\\s+elfu\\b`, 'i'));
  if (elfuMatch) {
    const mult = wordOrDigitToNumber(elfuMatch[1]);
    if (mult != null) return mult * 1000;
  }

  // Comma-grouped — "120,000"
  const commaMatch = s.match(/\b\d{1,3}(?:,\d{3})+\b/);
  if (commaMatch) return Number(commaMatch[0].replace(/,/g, ''));

  // Bare long digit run — "100000". 5+ digits only, so short numbers that
  // are part of a product name/model (e.g. "a9 camera") never get
  // mistaken for a price — \b before \d already guarantees "a9" doesn't
  // match here since there's no word-boundary between "a" and "9".
  const bareMatch = s.match(/\b\d{5,}\b/);
  if (bareMatch) return Number(bareMatch[0]);

  return null;
}

export function parsePriceExpression(query: string): ParsedPriceExpression {
  const s = query.toLowerCase();

  // Both bounds in one phrase.
  const rangeMatch =
    s.match(/(?:kati\s+ya|between)\s+(.+?)\s+(?:na|and)\s+(.+?)(?:[.,]|$)/i) ||
    s.match(/(.+?)\s+(?:mpaka|hadi|to)\s+(.+?)(?:[.,]|$)/i);
  if (rangeMatch) {
    const min = parseSingleAmount(rangeMatch[1]);
    const max = parseSingleAmount(rangeMatch[2]);
    if (min != null || max != null) {
      return { minPrice: min, maxPrice: max };
    }
  }

  // Ceiling only — "chini ya 150k", "under 150k", "less than 150k"
  const maxMatch = s.match(
    /(?:chini\s+ya|under|less\s+than)\s+(.+?)(?:[.,]|$)/i,
  );
  if (maxMatch) {
    const max = parseSingleAmount(maxMatch[1]);
    if (max != null) return { minPrice: null, maxPrice: max };
  }

  // Floor only — "zaidi ya 50k", "juu ya 50k", "above 50k", "more than 50k"
  const minMatch = s.match(
    /(?:zaidi\s+ya|juu\s+ya|above|more\s+than)\s+(.+?)(?:[.,]|$)/i,
  );
  if (minMatch) {
    const min = parseSingleAmount(minMatch[1]);
    if (min != null) return { minPrice: min, maxPrice: null };
  }

  // No range phrase — a bare amount anywhere in the query is treated as a
  // budget ceiling (how it's actually meant in natural Swahili/English
  // marketplace speech), not an exact-match filter.
  const bare = parseSingleAmount(s);
  if (bare != null) return { minPrice: null, maxPrice: bare };

  return { minPrice: null, maxPrice: null };
}
