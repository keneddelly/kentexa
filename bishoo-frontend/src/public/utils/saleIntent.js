/**
 * Does this Moment text read like an ad for something on sale? (owner 2026-10-26:
 * new users post sale items as Moments; a sale must become a classified ad so buyers
 * can find it in search.) Swahili and English signals; a price on its own is the
 * strongest one. Returns { sale, price } - price in TZS when one was written.
 *
 * Deliberately simple and explainable: words + a price. A Moment tagged to an
 * existing listing is never treated as a new ad (the listing already exists).
 */
const SALE_WORDS = [
  'nauza', 'inauzwa', 'zinauzwa', 'unauzwa', 'yanauzwa', 'vinauzwa', 'tunauza', 'anauza', 'kuuza',
  'bei', 'bei yake', 'bei nafuu', 'bei poa', 'punguzo', 'ofa', 'offer', 'for sale', 'selling', 'sell', 'price',
  'mpya kabisa', 'used', 'imetumika', 'iko sale', 'sale', 'tsh', 'tzs', 'shilingi', 'elfu', 'laki', 'milioni',
  'nipigie', 'call', 'whatsapp', 'inbox', 'dm', 'delivery', 'tunaleta', 'tunatuma',
];

const NUM = String.raw`(\d{1,3}(?:[,. ]\d{3})+|\d{4,})`;
const PRICE_PATTERNS = [
  // 1.5 milioni, 45k, 2 laki, 30 elfu
  { re: /(\d+(?:[.,]\d+)?)\s*(k|elfu|laki|m|milioni)\b/i, unit: true },
  // Tsh 35,000 / TZS 420000 / bei 420,000 / price: 35000
  { re: new RegExp(String.raw`(?:tsh|tzs|sh\.?|shilingi|bei|price)\s*[:.]?\s*` + NUM, 'i') },
  // 35,000/= / 420000 tsh
  { re: new RegExp(NUM + String.raw`\s*(?:\/=|\/-|tsh|tzs|sh\b)`, 'i') },
];

export function readPrice(text) {
  const s = String(text || '');
  for (const p of PRICE_PATTERNS) {
    const m = s.match(p.re);
    if (!m) continue;
    let n;
    if (p.unit) {
      const base = Number(String(m[1]).replace(',', '.'));
      const unit = m[2].toLowerCase();
      n = Math.round(base * (unit === 'k' || unit === 'elfu' ? 1000 : unit === 'laki' ? 100000 : 1000000));
    } else {
      n = Number(String(m[1]).replace(/[^0-9]/g, ''));
    }
    if (n >= 500) return n;
  }
  return null;
}

export function saleIntent(text, { tagged = false } = {}) {
  const raw = String(text || '');
  const t = ` ${raw.toLowerCase().replace(/\s+/g, ' ')} `;
  if (tagged || raw.trim().length < 3) return { sale: false, price: null };
  const price = readPrice(raw);
  const words = SALE_WORDS.filter((w) => t.includes(` ${w} `) || t.includes(` ${w},`) || t.includes(` ${w}.`) || t.includes(` ${w}:`));
  const strong = words.some((w) => ['nauza', 'inauzwa', 'zinauzwa', 'unauzwa', 'yanauzwa', 'vinauzwa', 'tunauza', 'for sale', 'selling'].includes(w));
  return { sale: !!price || strong || words.length >= 2, price };
}
