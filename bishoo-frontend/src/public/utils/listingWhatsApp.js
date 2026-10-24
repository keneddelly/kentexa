// WhatsApp from a KenteXa listing (owner 2026-10-25): the seller must see WHICH
// listing the customer means and that they came from KenteXa. Every contact
// button builds its message here: the item, its price, and its KenteXa link.

const SEGMENT = { product: 'product', classified: 'classified', service: 'service', store: 'store' };

/** 0712 345 678 / +255 712… / 712345678 -> 255712345678, or null. */
export function waNumber(raw) {
  let n = String(raw || '').replace(/[^\d]/g, '');
  if (!n) return null;
  if (n.startsWith('0')) n = `255${n.slice(1)}`;
  else if (n.length === 9) n = `255${n}`;
  return n.length >= 11 && n.length <= 15 ? n : null;
}

/** The listing's public KenteXa page, e.g. https://kentexa.com/product/42. */
export function listingUrl(kind, id, origin) {
  const seg = SEGMENT[kind];
  if (!seg || id == null || !/^\d+$/.test(String(id))) return null;
  const base = origin || (typeof window !== 'undefined' && /kentexa\.com$/.test(window.location.hostname)
    ? window.location.origin : 'https://kentexa.com');
  return `${base}/${seg}/${id}`;
}

const tzs = (n) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? `TZS ${Math.round(v).toLocaleString('en-US')}` : '';
};

/**
 * The message the customer sends, in plain Swahili:
 *   "Habari BIS, nimeona bidhaa hii kwenye KenteXa: Saa ya ukutani (TZS 300,000). Bado ipo?
 *    https://kentexa.com/product/42"
 */
export function listingInquiryText({ kind, title, price, url, shopName }) {
  const hello = shopName ? `Habari ${String(shopName).trim()},` : 'Habari,';
  const name = String(title || '').trim();
  const cost = tzs(price);
  const item = name ? `${name}${cost ? ` (${cost})` : ''}` : cost;
  let body;
  if (kind === 'service') body = `nimeona huduma yako kwenye KenteXa${item ? `: ${item}` : ''}. Ningependa kujua zaidi.`;
  else if (kind === 'store') body = 'nimeona duka lako kwenye KenteXa. Nina swali.';
  else if (kind === 'transport') body = 'nimeona huduma yako ya usafiri kwenye KenteXa. Ningependa kusafirisha mzigo.';
  else body = `nimeona ${kind === 'classified' ? 'tangazo lako' : 'bidhaa hii'} kwenye KenteXa${item ? `: ${item}` : ''}. Bado ipo?`;
  return [`${hello} ${body}`, url].filter(Boolean).join('\n');
}

/** The wa.me link with that message, or null when the number is not usable. */
export function listingWhatsAppHref({ phone, ...listing }) {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(listingInquiryText(listing))}` : null;
}
