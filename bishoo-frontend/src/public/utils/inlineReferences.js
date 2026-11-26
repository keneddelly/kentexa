const SOURCE_PRIORITY = Object.freeze({ mention: 4, manual: 3, hashtag: 2, automatic: 1 });

export const INLINE_ENTITY_TYPES = Object.freeze([
  'user', 'business', 'product', 'listing', 'service', 'topic',
]);

/** Offsets use JavaScript UTF-16 code units, the same indexing used by String.slice. */
export const isValidInlineReference = (text, reference) => {
  if (typeof text !== 'string' || !reference || typeof reference !== 'object') return false;
  const start = reference.startOffset;
  const end = reference.endOffset;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length) return false;
  if (!INLINE_ENTITY_TYPES.includes(reference.entityType) || reference.entityId == null || reference.entityId === '') return false;
  if (typeof reference.matchedText !== 'string' || text.slice(start, end) !== reference.matchedText) return false;
  return true;
};

/** Validate, deduplicate and resolve overlaps. Explicit references beat automatic ones. */
export const normalizeInlineReferences = (text, references = []) => {
  if (typeof text !== 'string' || !Array.isArray(references)) return [];
  const valid = references.filter((r) => isValidInlineReference(text, r));
  valid.sort((a, b) => {
    const priority = (SOURCE_PRIORITY[b.source] || 0) - (SOURCE_PRIORITY[a.source] || 0);
    return priority || (a.startOffset - b.startOffset) || (b.endOffset - a.endOffset);
  });
  const accepted = [];
  for (const candidate of valid) {
    const overlaps = accepted.some((r) => candidate.startOffset < r.endOffset && candidate.endOffset > r.startOffset);
    if (!overlaps) accepted.push(candidate);
  }
  return accepted.sort((a, b) => a.startOffset - b.startOffset);
};

/** Parse hashtags without changing text. Positions are UTF-16 offsets. */
export const parseHashtagRanges = (text) => {
  if (typeof text !== 'string' || !text) return [];
  const regex = /(^|[\s([{])#([\p{L}\p{M}\p{N}_]{1,64})/gu;
  const ranges = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    const prefixLength = match[1].length;
    const startOffset = match.index + prefixLength;
    const matchedText = match[0].slice(prefixLength);
    ranges.push({
      startOffset,
      endOffset: startOffset + matchedText.length,
      matchedText,
      hashtag: matchedText.slice(1),
    });
  }
  return ranges;
};

/** Produce plain-text and reference segments, with hashtags only in unreferenced text. */
export const buildInlineTextSegments = (text, references = []) => {
  if (typeof text !== 'string' || !text) return [];
  const parsedHashtags = parseHashtagRanges(text);
  const refs = normalizeInlineReferences(text, references).filter((r) =>
    r.source !== 'automatic' || !parsedHashtags.some((tag) => tag.startOffset < r.endOffset && tag.endOffset > r.startOffset),
  );
  const hashtags = parsedHashtags.filter((tag) =>
    !refs.some((r) => tag.startOffset < r.endOffset && tag.endOffset > r.startOffset),
  );
  const tokens = [...refs.map((r) => ({ ...r, kind: 'reference' })), ...hashtags.map((h) => ({ ...h, kind: 'hashtag' }))]
    .sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
  const segments = [];
  let cursor = 0;
  for (const token of tokens) {
    if (token.startOffset < cursor) continue;
    if (token.startOffset > cursor) segments.push({ kind: 'text', text: text.slice(cursor, token.startOffset) });
    segments.push({ ...token, text: text.slice(token.startOffset, token.endOffset) });
    cursor = token.endOffset;
  }
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) });
  return segments;
};
