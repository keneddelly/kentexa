// Makala (owner approved 2026-11-16): the simple layout marks a writer uses in an article's text.
// Same rules as the server's src/feed/article-text.ts.
//   ## Kichwa kidogo   a sub-heading line
//   - jambo            a list line
//   > nukuu            a quote line
//   **neno**           bold
//   [picha 2]          the article's 2nd photo, inside the text
// What people typed is saved unchanged; this only decides how it is shown.

export const ARTICLE = Object.freeze({ title: 150, text: 20000, photos: 5 });

const PHOTO = /^\s*\[picha (\d+)\]\s*$/i;
const HEAD = /^\s{0,3}#{1,3}\s+(.*)$/;
const ITEM = /^\s{0,3}[-*]\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;

/** The text as blocks: { type: 'p' | 'h' | 'ul' | 'quote' | 'photo', text, items, index }. */
export const articleBlocks = (text) => {
  const blocks = [];
  let para = [];
  const flush = () => { if (para.length) { blocks.push({ type: 'p', text: para.join('\n') }); para = []; } };
  String(text || '').replace(/\r\n?/g, '\n').split('\n').forEach((line) => {
    let m;
    if (!line.trim()) { flush(); return; }
    if ((m = line.match(PHOTO))) { flush(); blocks.push({ type: 'photo', index: Number(m[1]) }); return; }
    if ((m = line.match(HEAD))) { flush(); blocks.push({ type: 'h', text: m[1].trim() }); return; }
    if ((m = line.match(ITEM))) {
      flush();
      const last = blocks[blocks.length - 1];
      if (last && last.type === 'ul') last.items.push(m[1].trim()); else blocks.push({ type: 'ul', items: [m[1].trim()] });
      return;
    }
    if ((m = line.match(QUOTE))) {
      flush();
      const last = blocks[blocks.length - 1];
      if (last && last.type === 'quote') last.text += `\n${m[1]}`; else blocks.push({ type: 'quote', text: m[1] });
      return;
    }
    para.push(line);
  });
  flush();
  return blocks;
};

/** A line's bold parts: [{ text, bold }]. */
export const boldParts = (line) => String(line || '').split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
  .map((part) => (/^\*\*[^*]+\*\*$/.test(part) ? { text: part.slice(2, -2), bold: true } : { text: part, bold: false }));

/** The plain words, without layout marks (for cards and previews). */
export const stripArticle = (text) => String(text || '')
  .replace(/^\s*\[picha \d+\]\s*$/gim, '')
  .replace(/^\s{0,3}(?:#{1,3}|[-*]|>)\s+/gm, '')
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .replace(/\n{2,}/g, '\n')
  .trim();

/** Minutes to read, at about 200 words a minute (at least 1). */
export const readMinutes = (text) => Math.max(1, Math.round(stripArticle(text).split(/\s+/).filter(Boolean).length / 200));

/**
 * Photo 1 is the cover unless the text places "[picha 1]" itself (an article with no cover).
 * Returns the cover (or null) and the photo for "[picha N]".
 */
export const articlePhotos = (media, text) => {
  const list = Array.isArray(media) ? media.filter((m) => m && m.url) : [];
  const firstInside = /^\s*\[picha 1\]\s*$/im.test(String(text || ''));
  return {
    cover: !firstInside && list[0] ? list[0] : null,
    photo: (n) => list[Number(n) - 1] || null,
  };
};
