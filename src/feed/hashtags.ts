/**
 * Hashtags (owner approved 2026-11-15): one reader for the whole app. The frontend keeps an
 * exact copy (bishoo-frontend/src/public/utils/hashtags.js) so what the composer suggests, what
 * a post shows as a link and what the server saves are always the same tags.
 *
 * Rules, as the big networks do them:
 *  - a tag starts with # at the start of the text or after a space or ( [ {, so links like
 *    kentexa.com/#x and text like "a#b" are not tags;
 *  - it is 2 to 50 letters, numbers, marks or _ ; a longer run is not a tag at all;
 *  - it must hold at least one letter (#2026 is a number, not a tag);
 *  - #Mitumba and #mitumba are the same tag (NFKC, then lower case); the first way it was
 *    written is how it shows;
 *  - at most 5 tags count per post; any more stay as plain text.
 */
export const MAX_HASHTAGS = 5;

const TAG_RE = /(^|[\s([{])#([\p{L}\p{M}\p{N}_]{2,50})(?![\p{L}\p{M}\p{N}_])/gu;
const HAS_LETTER = /\p{L}/u;

export interface Hashtag {
  key: string;
  display: string;
}

/** The key a tag is saved and looked up by. Null when it is not a valid tag. */
export function hashtagKey(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const tag = raw.trim().replace(/^#/, '').normalize('NFKC');
  if (!/^[\p{L}\p{M}\p{N}_]{2,50}$/u.test(tag) || !HAS_LETTER.test(tag)) return null;
  return tag.toLowerCase();
}

/** The tags in a text, in order, without repeats, at most MAX_HASHTAGS. */
export function extractHashtags(text: string | null | undefined): Hashtag[] {
  if (typeof text !== 'string' || !text.includes('#')) return [];
  const out: Hashtag[] = [];
  const seen = new Set<string>();
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
