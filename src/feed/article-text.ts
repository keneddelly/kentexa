/**
 * Makala (owner approved 2026-11-16): the simple layout marks a writer can use in an article's
 * text, and what they look like as plain words (for previews, search and excerpts).
 *   ## Kichwa kidogo   a sub-heading line
 *   - jambo            a list line
 *   > nukuu            a quote line
 *   **neno**           bold
 *   [picha 2]          the article's 2nd photo inside the text (photo 1 is the cover)
 */
export const stripArticle = (text: unknown): string => String(text ?? '')
  .replace(/^\s*\[picha \d+\]\s*$/gim, '')
  .replace(/^\s{0,3}(?:#{1,3}|[-*]|>)\s+/gm, '')
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .replace(/\n{2,}/g, '\n')
  .trim();

/** Minutes to read, at about 200 words a minute (at least 1). */
export const readMinutes = (text: unknown): number => {
  const words = stripArticle(text).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
};
