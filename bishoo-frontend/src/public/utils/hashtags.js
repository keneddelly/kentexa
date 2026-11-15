// Hashtags (owner approved 2026-11-15). Exact copy of the server's reader
// (src/feed/hashtags.ts): what the composer suggests, what a post shows as a link and what the
// server saves are always the same tags.
//  - a tag starts at the start of the text or after a space or ( [ { ;
//  - 2 to 50 letters, numbers, marks or _ ; a longer run is not a tag at all;
//  - at least one letter (#2026 is a number, not a tag);
//  - #Mitumba and #mitumba are one tag (NFKC, then lower case);
//  - at most 5 tags count per post; any more stay plain text.
export const MAX_HASHTAGS = 5;

const TAG_RE = /(^|[\s([{])#([\p{L}\p{M}\p{N}_]{2,50})(?![\p{L}\p{M}\p{N}_])/gu;
const HAS_LETTER = /\p{L}/u;

/** The key a tag is saved and looked up by. Null when it is not a valid tag. */
export function hashtagKey(raw) {
  if (typeof raw !== 'string') return null;
  const tag = raw.trim().replace(/^#/, '').normalize('NFKC');
  if (!/^[\p{L}\p{M}\p{N}_]{2,50}$/u.test(tag) || !HAS_LETTER.test(tag)) return null;
  return tag.toLowerCase();
}

/** The tags in a text, in order, without repeats, at most MAX_HASHTAGS. */
export function extractHashtags(text) {
  if (typeof text !== 'string' || !text.includes('#')) return [];
  const out = [];
  const seen = new Set();
  for (const m of text.matchAll(TAG_RE)) {
    const display = m[2].normalize('NFKC');
    const key = hashtagKey(display);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, display });
    if (out.length >= MAX_HASHTAGS) break;
  }
  return out;
}

/** How many different tags a text has, without the limit (to tell the writer when it is over 5). */
export function countHashtags(text) {
  if (typeof text !== 'string' || !text.includes('#')) return 0;
  const keys = new Set();
  for (const m of text.matchAll(TAG_RE)) { const k = hashtagKey(m[2]); if (k) keys.add(k); }
  return keys.size;
}

/**
 * The text cut into plain parts and tag parts, for showing tags as links. Only the first
 * MAX_HASHTAGS different tags are links (every time they appear); later ones stay plain text.
 */
export function splitHashtags(text) {
  if (typeof text !== 'string' || !text) return [];
  if (!text.includes('#')) return [{ text }];
  const linked = new Set(extractHashtags(text).map((t) => t.key));
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(TAG_RE)) {
    const key = hashtagKey(m[2]);
    if (!key || !linked.has(key)) continue;
    const start = m.index + m[1].length;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: `#${m[2]}`, key });
    last = start + 1 + m[2].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/**
 * Composer: the tag being typed right before the cursor, or null.
 * "Nauza #mit|" → { start: 6, query: 'mit' } (start = where the # is).
 */
export function hashtagBeingTyped(text, caret) {
  if (typeof text !== 'string') return null;
  const end = typeof caret === 'number' ? caret : text.length;
  const m = text.slice(0, end).match(/(^|[\s([{])#([\p{L}\p{M}\p{N}_]{1,50})$/u);
  if (!m) return null;
  return { start: end - m[2].length - 1, query: m[2] };
}

/** Composer: put the chosen tag in place of the one being typed, followed by a space. */
export function insertHashtag(text, typed, display, caret) {
  const end = typeof caret === 'number' ? caret : text.length;
  const before = text.slice(0, typed.start);
  const after = text.slice(end).replace(/^[\p{L}\p{M}\p{N}_]*/u, '');
  const inserted = `#${display}${after.startsWith(' ') ? '' : ' '}`;
  return { text: before + inserted + after, caret: before.length + inserted.length };
}
