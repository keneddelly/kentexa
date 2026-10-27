// Hotel food ordering (owner 2026-10-27): shared words and rules for the customer and
// hotel screens. The server decides; these only mirror its rules for display.

export const tzs = (n) => `TZS ${Math.round(Number(n || 0)).toLocaleString('en-US')}`;

/** Same rule as the server: Lipa Namba when set; after eating for eat-here; cash on pickup when allowed. */
export function foodPaymentOptions(settings, mode) {
  if (mode === 'delivery') return settings?.delivery ? ['cod'] : [];
  const out = [];
  if (settings?.lipaNamba) out.push('lipa_namba');
  if (mode === 'dine_in' && settings?.payAfterDineIn) out.push('pay_after');
  if (mode === 'pickup' && settings?.codPickup) out.push('cod');
  return out;
}

export const PAY_LABEL = {
  lipa_namba: { label: 'Lipa Namba sasa', hint: 'M-Pesa, Mixx by Yas, Airtel Money, HaloPesa' },
  pay_after: { label: 'Lipa ukimaliza kula', hint: 'Taslimu au Lipa Namba kwa mhudumu' },
  cod: { label: 'Lipa ukipokea', hint: 'Lipa ukichukua chakula hotelini' },
};
/** Delivery is paid to the wakala at the door: the food and the delivery fee. */
export const DELIVERY_PAY = { label: 'Lipa ukipokea', hint: 'Mlipe wakala akifika: chakula na usafiri. Taslimu au Lipa Namba ya hoteli.' };

export const MODE_LABEL = {
  dine_in: { label: 'Kula hapa', hint: 'Meza au chumba' },
  pickup: { label: 'Chukua', hint: 'Nitapita kuchukua' },
  delivery: { label: 'Letewa', hint: 'Wakala analeta' },
};

/** What the customer reads as the order's state. */
export function foodStatusTitle(order) {
  switch (order?.status) {
    case 'new': return 'Inasubiri jikoni wapokee';
    case 'cooking': return 'Inapikwa';
    case 'ready': return 'Iko tayari';
    case 'done': return 'Imekamilika';
    case 'rejected': return 'Hoteli imekataa oda';
    case 'cancelled': return 'Umeghairi oda';
    default: return '';
  }
}

/** The payment line, for the customer (forHotel=false) or the kitchen (forHotel=true). */
export function foodPaymentLine(order, forHotel) {
  const m = order?.paymentMethod;
  const s = order?.paymentStatus;
  if (m === 'pay_after') return s === 'paid' ? 'Amelipa' : forHotel ? 'Atalipa akimaliza kula' : 'Utalipa ukimaliza kula';
  if (m === 'cod' && order?.mode === 'delivery') return s === 'paid' ? 'Amelipa' : forHotel ? 'Atamlipa wakala akipokea' : 'Utamlipa wakala ukipokea';
  if (m === 'cod') return s === 'paid' ? 'Amelipa' : forHotel ? 'Atalipa akichukua' : 'Utalipa ukichukua';
  if (s === 'paid') return 'Lipa Namba · imethibitishwa';
  if (s === 'proof_sent') return forHotel ? 'Lipa Namba · picha imetumwa, thibitisha' : 'Lipa Namba · hoteli inathibitisha';
  if (s === 'rejected') return forHotel ? 'Lipa Namba · umekataa picha, anatuma tena' : 'Lipa Namba · picha haikukubaliwa';
  return forHotel ? 'Lipa Namba · bado hajatuma picha' : 'Lipa Namba · bado hujatuma picha';
}

/** "sasa hivi", "dk 5", "saa 1 dk 10" since a time. */
export function minutesSince(at, now = Date.now()) {
  const m = Math.max(0, Math.floor((now - new Date(at).getTime()) / 60000));
  if (m < 1) return 'sasa hivi';
  if (m < 60) return `dk ${m}`;
  return `saa ${Math.floor(m / 60)} dk ${m % 60}`;
}

/** The menu's public link; a QR on a table or room carries its number. */
export function menuLink(businessId, placeType, placeNumber, origin = (typeof window !== 'undefined' ? window.location.origin : '')) {
  const base = `${origin}/menu/${businessId}`;
  if (placeType === 'table' && placeNumber) return `${base}?meza=${placeNumber}`;
  if (placeType === 'room' && placeNumber) return `${base}?chumba=${placeNumber}`;
  return base;
}

/** Reads /menu/:businessId?meza=4 (or ?chumba=12) into the page and its table/room. */
export function parseMenuPath(pathname, search) {
  const m = String(pathname || '').match(/^\/menu\/(\d+)\/?$/);
  if (!m) return null;
  const p = new URLSearchParams(search || '');
  const meza = Number(p.get('meza'));
  const chumba = Number(p.get('chumba'));
  const place = Number.isInteger(meza) && meza > 0 ? { placeType: 'table', placeNumber: meza }
    : Number.isInteger(chumba) && chumba > 0 ? { placeType: 'room', placeNumber: chumba } : {};
  return { page: `HotelMenu-${m[1]}`, navParams: place };
}

export const FOOD_COLORS = { ink: '#0f1419', muted: '#536471', line: '#eff3f4', border: '#cfd9de', blue: '#1d4ed8', blueSoft: '#eff6ff', green: '#15803d', amber: '#92400e', amberSoft: '#fffbeb', red: '#b91c1c' };
