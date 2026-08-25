/**
 * SearchTermNormalizer — deterministic query normalization layer
 * Place at: src/search/search-term-normalizer.util.ts
 *
 * Pure, synchronous, zero AI dependency (same posture as
 * price-expression-parser.util.ts, which this reuses for noise-stripping).
 * Fixes the "kamera returns nothing, camera works" class of bug: the DB
 * search endpoints used to LIKE-match the raw query string verbatim against
 * one language's spelling. This turns a raw query into a deduplicated set of
 * match terms — the original words plus any Swahili/English marketplace
 * synonym expansions (search-term-dictionary.data.ts) plus simple plural
 * stripping — so "kamera" pulls in "camera"/"cameras"/"kameras" as
 * additional OR'd LIKE patterns instead of only ever matching itself.
 *
 * This is the QUERY NORMALIZATION step of the search pipeline; it never
 * talks to the database or an AI provider, and it never invents results —
 * it only widens which literal substrings count as a match against real
 * rows. Callers still run an ordinary LIKE-based query against real data.
 */
import { SEARCH_TERM_SYNONYM_GROUPS } from './search-term-dictionary.data';

export interface NormalizedSearchQuery {
  cleanedQuery: string;
  terms: string[];
  patterns: string[]; // "%term%", ready to bind as LIKE parameters
}

// Word → its full synonym set, built once. Every word in a group maps to
// the same Set instance (including itself), so a single lookup returns
// every equivalent term.
const SYNONYM_INDEX: Map<string, Set<string>> = (() => {
  const index = new Map<string, Set<string>>();
  for (const group of SEARCH_TERM_SYNONYM_GROUPS) {
    const set = new Set(group.map((g) => g.toLowerCase()));
    for (const term of group) index.set(term.toLowerCase(), set);
  }
  return index;
})();

const MULTI_WORD_PHRASES = SEARCH_TERM_SYNONYM_GROUPS.flat()
  .map((p) => p.toLowerCase())
  .filter((p) => p.includes(' '));

// Substrings that mean "there was a price expression here" — stripped
// before term extraction so "kamera ya 100k" doesn't try to LIKE-match the
// literal text "100k" against a product title. Mirrors the patterns
// price-expression-parser.util.ts recognizes as price signals; kept as a
// removal pass rather than importing that module's internals, since the
// two files have different jobs (extract a number vs. discard the text).
const NOISE_PATTERNS: RegExp[] = [
  /\bnusu\s+laki\b/gi,
  /\blaki\s+(moja|mbili|tatu|nne|tano|sita|saba|nane|tisa|kumi|\d+)\b/gi,
  /\b(moja|mbili|tatu|nne|tano|sita|saba|nane|tisa|kumi|\d+)\s+laki\b/gi,
  /\belfu\s+(moja|mbili|tatu|nne|tano|sita|saba|nane|tisa|kumi|\d+)\b/gi,
  /\b(moja|mbili|tatu|nne|tano|sita|saba|nane|tisa|kumi|\d+)\s+elfu\b/gi,
  /\b\d+(?:\.\d+)?\s*k\b/gi,
  /\b\d{1,3}(?:,\d{3})+\b/g,
  /\b\d{5,}\b/g,
  /\b(kati\s+ya|between|chini\s+ya|zaidi\s+ya|juu\s+ya|under|above|less\s+than|more\s+than|mpaka|hadi)\b/gi,
];

// Connector/filler words that carry no product-search meaning on their
// own — stripped so they never become a standalone LIKE pattern (which
// would match almost every row and drown out real matches).
const STOPWORDS = new Set([
  'ya', 'cha', 'kwa', 'na', 'wa', 'la', 'ajili', 'kwa ajili ya',
  'of', 'for', 'in', 'at', 'the', 'a', 'an', 'is', 'are', 'to',
  // "camera shop" / "duka la kamera" / "who sells fish" — the shop/seller
  // word itself carries no product-search meaning; stripping it leaves
  // just "camera"/"kamera"/"fish" as the real search term, which is what
  // actually needs to match a business's category/bio/aiKeywords.
  'shop', 'shops', 'store', 'stores', 'duka', 'maduka',
  'seller', 'sellers', 'muuzaji', 'wauzaji', 'who', 'sells', 'sell',
]);

function stripNoise(rawQuery: string): string {
  let s = ` ${rawQuery.toLowerCase().trim()} `;
  for (const re of NOISE_PATTERNS) s = s.replace(re, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

export function normalizeSearchQuery(rawQuery: string): NormalizedSearchQuery {
  const noiseStripped = stripNoise(rawQuery || '');
  const words = noiseStripped.split(/\s+/).filter((w) => w && !STOPWORDS.has(w));
  const cleanedQuery = words.join(' ').trim();

  const termSet = new Set<string>();
  if (cleanedQuery.length >= 2) termSet.add(cleanedQuery);

  // Multi-word dictionary phrases (e.g. "kinasa sauti", "spy camera") —
  // matched against the cleaned text, not word-by-word, since splitting
  // would lose the phrase.
  for (const phrase of MULTI_WORD_PHRASES) {
    if (cleanedQuery.includes(phrase)) {
      SYNONYM_INDEX.get(phrase)?.forEach((g) => termSet.add(g));
    }
  }

  // Per-word matches, with simple trailing-"s" stripping for loanwords
  // colloquially pluralized in English ("kameras"). Every meaningful word
  // — dictionary hit or not — stays a term in its own right, so brand
  // names/model numbers/anything outside the dictionary are still
  // searchable exactly as typed.
  for (const w of words) {
    if (w.length < 2) continue;
    termSet.add(w);
    const singular = w.endsWith('s') && w.length > 3 ? w.slice(0, -1) : null;
    const group = SYNONYM_INDEX.get(w) || (singular ? SYNONYM_INDEX.get(singular) : undefined);
    if (group) group.forEach((g) => termSet.add(g));
    else if (singular) termSet.add(singular);
  }

  // Nothing survived (e.g. the whole query was noise/stopwords) — fall
  // back to the raw trimmed query so callers always get at least one term
  // rather than an empty, all-matching WHERE clause.
  let terms = [...termSet].filter(Boolean);
  if (!terms.length) {
    const fallback = rawQuery.trim().toLowerCase();
    if (fallback) terms = [fallback];
  }

  return {
    cleanedQuery,
    terms,
    patterns: terms.map((t) => `%${t}%`),
  };
}
