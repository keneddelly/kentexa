/**
 * Hashtag parsing for Kentexa's social text.
 * Hashtags remain part of the user's original post text; this helper only
 * identifies valid tags for previews and future discovery indexing.
 */
const HASHTAG_PATTERN = /(^|[\s([{])#([\p{L}\p{N}_]{2,50})/gu;

export const extractHashtags = (value = '') => {
  const text = String(value || '');
  const seen = new Set();
  const tags = [];
  for (const match of text.matchAll(HASHTAG_PATTERN)) {
    const label = match[2];
    const normalized = label.normalize('NFKC').toLocaleLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    tags.push({ label, normalized });
  }
  return tags;
};

export const hashtagSearchQuery = (tag) => String(tag || '').replace(/^#/, '').trim();
