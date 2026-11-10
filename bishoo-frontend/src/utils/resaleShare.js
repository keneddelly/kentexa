/**
 * "Uza tena": share an offer to WhatsApp Status (owner 2026-11-10, growth plan). WhatsApp sellers
 * post pictures to Status, not links, so this makes one ready picture (the product photo, the
 * reseller's price, their name and the short link) and a ready caption. Made in the browser;
 * never shows the supplier price. If the phone can share files, the share sheet opens with the
 * picture and the caption; otherwise the picture is saved and the caption copied.
 */
import { productLink } from '../public/utils/shareLinks';

/** The link a reseller shares: the product page with their offer on it. */
export const resaleLink = (product, offerId) => `${productLink(product.id, product.name)}?offer=${offerId}`;

const W = 1080;
const H = 1920;
const tzs = (n) => `TZS ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

/** The words that go with the picture. */
export function statusCaption({ name, price, note, link }) {
  return [name, `Bei: ${tzs(price)}`, note || null, `Agiza hapa: ${link}`].filter(Boolean).join('\n');
}

const loadImage = (src) => new Promise((resolve) => {
  if (!src) { resolve(null); return; }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

const wrap = (ctx, text, maxWidth, maxLines) => {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = []; let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !cur) cur = next;
    else { lines.push(cur); cur = w; if (lines.length === maxLines) break; }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s*\S*$/, '')}...`;
  return lines;
};

/** The Status picture as a PNG blob (1080 x 1920). */
export async function statusImage({ name, price, note, image, resellerName, link }) {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1d4ed8'; ctx.fillRect(0, 0, W, 140);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 56px Helvetica, Arial, sans-serif'; ctx.textBaseline = 'middle';
  ctx.fillText('KenteXa', 60, 70);

  const img = await loadImage(image);
  const box = { x: 60, y: 200, s: 960 };
  ctx.fillStyle = '#f1f5f9'; ctx.fillRect(box.x, box.y, box.s, box.s);
  if (img) {
    const scale = Math.max(box.s / img.width, box.s / img.height);
    const w = img.width * scale; const h = img.height * scale;
    ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.s, box.s); ctx.clip();
    ctx.drawImage(img, box.x + (box.s - w) / 2, box.y + (box.s - h) / 2, w, h);
    ctx.restore();
  }

  let y = box.y + box.s + 90;
  ctx.fillStyle = '#0f1419'; ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 60px Helvetica, Arial, sans-serif';
  for (const line of wrap(ctx, name, W - 120, 2)) { ctx.fillText(line, 60, y); y += 74; }
  y += 20;
  ctx.fillStyle = '#1d4ed8'; ctx.font = 'bold 96px Helvetica, Arial, sans-serif';
  ctx.fillText(tzs(price), 60, y); y += 80;
  if (note) {
    ctx.fillStyle = '#536471'; ctx.font = '44px Helvetica, Arial, sans-serif';
    for (const line of wrap(ctx, note, W - 120, 2)) { ctx.fillText(line, 60, y); y += 56; }
  }
  ctx.fillStyle = '#0f1419'; ctx.font = 'bold 44px Helvetica, Arial, sans-serif';
  ctx.fillText(resellerName ? `Agiza kwa ${resellerName}` : 'Agiza sasa', 60, H - 150);
  ctx.fillStyle = '#536471'; ctx.font = '36px Helvetica, Arial, sans-serif';
  const shortLink = String(link || '').replace(/^https?:\/\//, '');
  ctx.fillText(wrap(ctx, shortLink, W - 120, 1)[0] || '', 60, H - 90);

  return new Promise((resolve) => {
    try { canvas.toBlob((b) => resolve(b), 'image/png'); } catch { resolve(null); }
  });
}

/**
 * Share one offer to Status. offer: { id, price, note }, product: { id, name, image },
 * Returns 'shared' | 'saved' | 'copied' | 'cancelled'.
 */
export async function shareToStatus({ product, offer, resellerName }) {
  const link = resaleLink(product, offer.id);
  const caption = statusCaption({ name: product.name, price: offer.price, note: offer.note, link });
  const blob = await statusImage({ name: product.name, price: offer.price, note: offer.note, image: product.image, resellerName, link });
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  if (blob && nav?.share && typeof File !== 'undefined') {
    const file = new File([blob], `uza-tena-${offer.id}.png`, { type: 'image/png' });
    if (!nav.canShare || nav.canShare({ files: [file] })) {
      try { await nav.share({ files: [file], text: caption }); return 'shared'; } catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
    }
  }
  try { await nav?.clipboard?.writeText(caption); } catch { /* clipboard blocked */ }
  if (blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `uza-tena-${offer.id}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return 'saved';
  }
  return 'copied';
}

export const STATUS_DONE = {
  shared: '',
  saved: 'Picha imehifadhiwa na maelezo yamenakiliwa. Iweke kwenye Status, kisha bandika maelezo.',
  copied: 'Maelezo yamenakiliwa. Yabandike kwenye Status au kikundi.',
  cancelled: '',
};
