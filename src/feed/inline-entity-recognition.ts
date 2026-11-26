export type InlineEntityType = 'business' | 'product' | 'listing' | 'service';

export type InlineEntityCandidate = {
  entityType: InlineEntityType;
  entityId: string | number;
  name: string;
  aliases?: string[];
  discoverable: boolean;
};

export type InlineEntityMatch = {
  entityType: InlineEntityType;
  entityId: string | number;
  matchedText: string;
  startOffset: number;
  endOffset: number;
  source: 'automatic';
  confidence: 1;
};

const COMMON_TERMS = new Set([
  'biashara', 'bidhaa', 'huduma', 'camera', 'kamera', 'phone', 'simu',
  'business', 'product', 'service', 'shop', 'store', 'company', 'bei',
  'pesa', 'sale', 'offer', 'new', 'good', 'nzuri', 'technology', 'teknolojia',
]);

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isCommonTerm = (value: string) => COMMON_TERMS.has(value.trim().toLocaleLowerCase());

/**
 * Deterministic, exact-name/alias recognition. It intentionally does not fuzzy-match,
 * guess, or expose non-discoverable candidates. Offsets are UTF-16 code units.
 */
export const recognizeInlineEntities = (
  text: string,
  candidates: InlineEntityCandidate[] = [],
): InlineEntityMatch[] => {
  if (typeof text !== 'string' || !text || !Array.isArray(candidates)) return [];

  const prepared = candidates
    .filter((candidate) => candidate && candidate.discoverable === true
      && ['business', 'product', 'listing', 'service'].includes(candidate.entityType)
      && candidate.entityId != null && candidate.name?.trim())
    .flatMap((candidate) => {
      const names = [...new Set([candidate.name, ...(candidate.aliases || [])]
        .filter((name) => typeof name === 'string' && name.trim()))];
      return names
        .filter((name) => !isCommonTerm(name))
        .map((name) => ({ candidate, name: name.trim() }));
    });

  const matches: InlineEntityMatch[] = [];
  for (const { candidate, name } of prepared) {
    const escaped = escapeRegex(name).replace(/\\\s+/g, '\\s+');
    const regex = new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}_])(${escaped})(?=$|[^\\p{L}\\p{M}\\p{N}_])`, 'giu');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const matchedText = match[2];
      const startOffset = match.index + match[1].length;
      matches.push({
        entityType: candidate.entityType,
        entityId: candidate.entityId,
        matchedText,
        startOffset,
        endOffset: startOffset + matchedText.length,
        source: 'automatic',
        confidence: 1,
      });
    }
  }

  // An exact name/alias shared by multiple visible entities is ambiguous and is omitted.
  const byRange = new Map<string, InlineEntityMatch[]>();
  for (const match of matches) {
    const key = `${match.startOffset}:${match.endOffset}:${match.matchedText.toLocaleLowerCase()}`;
    byRange.set(key, [...(byRange.get(key) || []), match]);
  }
  const unique = [...byRange.values()].filter((group) => {
    const ids = new Set(group.map((m) => `${m.entityType}:${m.entityId}`));
    return ids.size === 1;
  }).map((group) => group[0]);

  // Prefer longer exact phrases when they overlap; keep non-overlapping occurrences.
  unique.sort((a, b) => (b.endOffset - b.startOffset) - (a.endOffset - a.startOffset)
    || a.startOffset - b.startOffset);
  const accepted: InlineEntityMatch[] = [];
  for (const candidate of unique) {
    if (!accepted.some((m) => candidate.startOffset < m.endOffset && candidate.endOffset > m.startOffset)) {
      accepted.push(candidate);
    }
  }
  return accepted.sort((a, b) => a.startOffset - b.startOffset);
};
