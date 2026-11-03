/**
 * Professional links (owner 2026-11-03): pure helpers for the kentexa.com page a shared link
 * opens. `injectMeta` puts the page's own title, description and picture into the app's
 * index.html (replacing the generic ones), so WhatsApp/Facebook show a real preview and the
 * person lands on the same address.
 */
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const cut = (s: unknown, max: number) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };

/** "Simu Samsung A15 (128GB)!" -> "simu-samsung-a15-128gb" (ASCII, at most 60 characters). */
export function slugify(text: unknown): string {
  return String(text ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60).replace(/-+$/g, '');
}

/** "42-simu-samsung" or "42" -> 42; anything else -> null. */
export function parseRef(ref: unknown): number | null {
  const m = String(ref ?? '').match(/^(\d{1,10})(?:-[a-z0-9-]*)?$/i);
  return m ? Number(m[1]) : null;
}

export function injectMeta(index: string, p: { title: string; description: string; image: string | null; url: string; fallbackImage: string }): string {
  const title = esc(cut(p.title, 90));
  const desc = esc(cut(p.description, 200));
  const image = esc(p.image || p.fallbackImage);
  const url = esc(p.url);
  const tags = [
    `<title>${title}</title>`,
    `<meta name="description" content="${desc}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="KenteXa" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${desc}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${desc}" />`,
    `<meta name="twitter:image" content="${image}" />`,
  ].join('');
  const cleaned = index
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+(?:name="description"|property="og:[^"]*"|name="twitter:[^"]*")[^>]*>/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>/gi, '');
  return cleaned.replace(/<head([^>]*)>/i, `<head$1>${tags}`);
}
