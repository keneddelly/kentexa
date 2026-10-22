import * as crypto from 'crypto';

/**
 * Seller notice for a direct-payment checkout (MARKETPLACE_PAYMENT_MODE cod_lipa).
 *
 * A direct-payment order skips the payment step, so the seller SMS in
 * NotificationsService.orderPaid() never fires for it. POST /orders/checkout
 * creates every cart item's order in one request and sends ONE message per
 * seller for that checkout (a cart with two sellers = two messages). Grouping
 * lives only in that request: nothing is stored, so no migration.
 *
 * The message carries one private link: ${FRONTEND_URL}/?sellerCheckout=<token>.
 * The token is signed (HMAC-SHA256, key derived from JWT_SECRET) and expires
 * after 7 days; GET /orders/seller-checkout/:token shows nothing without a
 * valid one.
 */

export const SELLER_CHECKOUT_LINK_DAYS = 7;

/** The seller link's site: FRONTEND_URL when set, else the live site (never the onrender.com fallback). */
export function sellerCheckoutLink(token: string, frontendUrl = process.env.FRONTEND_URL): string {
  const base = (frontendUrl || 'https://kentexa.com').replace(/\/+$/, '');
  return `${base}/?sellerCheckout=${token}`;
}
const TOKEN_KEY_LABEL = 'kentexa-seller-checkout-link-v1';
const MAX_NAME = 40;

export interface NoticeOrder {
  id: number;
  quantity: number;
  totalAmount: number | string;
  deliveryFeeAmount?: number | string | null;
  paymentMethod: string;
  paymentMode?: string | null;
  productName: string;
  sellerId: number | null;
}

export interface SellerCheckoutGroup {
  sellerId: number;
  orders: NoticeOrder[];
}

/** Direct-payment orders only, one group per seller, in checkout order. */
export function groupDirectOrdersBySeller(orders: NoticeOrder[]): SellerCheckoutGroup[] {
  const groups = new Map<number, SellerCheckoutGroup>();
  for (const order of orders) {
    if (order.paymentMode !== 'cod_lipa' || !order.sellerId) continue;
    const group = groups.get(order.sellerId) ?? { sellerId: order.sellerId, orders: [] };
    group.orders.push(order);
    groups.set(order.sellerId, group);
  }
  return [...groups.values()];
}

const tzs = (n: number) => `TZS ${Math.round(n).toLocaleString('en-US')}`;
const short = (name: string) => {
  const clean = String(name || 'Bidhaa').replace(/\s+/g, ' ').trim();
  return clean.length > MAX_NAME ? `${clean.slice(0, MAX_NAME - 1).trimEnd()}…` : clean;
};

export function checkoutTotal(orders: NoticeOrder[]): number {
  return orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
}

export interface SellerMessageInput {
  orders: NoticeOrder[];
  /** The one place picked at checkout ("Ward, District, Region"). */
  place: string | null;
  /** Lipa Namba: the reference the buyer typed with the payment screenshot. */
  lipaReference?: string | null;
  buyerName: string | null;
  buyerPhone: string | null;
  link: string;
}

/** The text sent by SMS to the seller, and pre-filled in the buyer's WhatsApp button. */
export function buildSellerCheckoutMessage(input: SellerMessageInput): string {
  const { orders } = input;
  const method = orders[0]?.paymentMethod;
  const lines = [
    `KenteXa: Agizo jipya ${orders.map((o) => `#${o.id}`).join(', ')}.`,
    ...orders.map((o, i) => {
      const fee = Number(o.deliveryFeeAmount || 0);
      return `${i + 1}) ${short(o.productName)} x${o.quantity}: ${tzs(Number(o.totalAmount || 0))}` +
        (fee > 0 ? ` (pamoja na usafiri ${tzs(fee)})` : '');
    }),
    `Jumla: ${tzs(checkoutTotal(orders))}`,
    `Malipo: ${method === 'lipa_namba' ? 'Lipa Namba yako (mnunuzi ametuma picha ya malipo)' : 'Pesa mkononi wakati wa kupokea (COD)'}`,
    ...(method === 'lipa_namba' && input.lipaReference ? [`Kumbukumbu ya malipo: ${input.lipaReference}`] : []),
    `Mahali: ${input.place || 'haijulikani'}`,
    `Mnunuzi: ${[input.buyerName, input.buyerPhone].filter(Boolean).join(', ') || 'haijulikani'}`,
    `Maelezo: ${input.link}`,
  ];
  return lines.join('\n');
}

// ── Signed link token ─────────────────────────────────────────────────────

export interface SellerCheckoutTokenPayload {
  /** seller user id */
  s: number;
  /** order ids of this checkout for that seller */
  o: number[];
  /** buyer's tz_region / tz_district ids (names are not stored on the order) */
  r: number | null;
  d: number | null;
  /** expiry, unix seconds */
  e: number;
}

function tokenKey(secret: string): Buffer {
  return crypto.createHmac('sha256', secret).update(TOKEN_KEY_LABEL).digest();
}
const b64url = (buf: Buffer) => buf.toString('base64url');

/** Throws if the secret is missing: a link must never be signed with an empty key. */
export function signSellerCheckoutToken(payload: SellerCheckoutTokenPayload, secret: string | undefined): string {
  if (!secret) throw new Error('JWT_SECRET is required to sign seller checkout links');
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(crypto.createHmac('sha256', tokenKey(secret)).update(body).digest());
  return `${body}.${sig}`;
}

/** Never throws: anything not valid, or expired, is null. */
export function verifySellerCheckoutToken(
  token: string | null | undefined,
  secret: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): SellerCheckoutTokenPayload | null {
  if (!secret || typeof token !== 'string' || token.length > 600) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = crypto.createHmac('sha256', tokenKey(secret)).update(parts[0]).digest();
  let given: Buffer;
  try { given = Buffer.from(parts[1], 'base64url'); } catch { return null; }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let payload: SellerCheckoutTokenPayload;
  try { payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch { return null; }
  if (!payload || !Number.isInteger(payload.s) || !Array.isArray(payload.o) || payload.o.length === 0 ||
    !payload.o.every((id) => Number.isInteger(id) && id > 0) || !Number.isInteger(payload.e)) return null;
  if (payload.e <= nowSeconds) return null;
  return payload;
}

export function sellerCheckoutExpiry(nowSeconds = Math.floor(Date.now() / 1000)): number {
  return nowSeconds + SELLER_CHECKOUT_LINK_DAYS * 24 * 60 * 60;
}

// ── WhatsApp ──────────────────────────────────────────────────────────────

/** "0712 345 678" / "+255712345678" / "712345678" -> "255712345678"; null when not a TZ mobile. */
export function whatsappNumber(value: string | null | undefined): string | null {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `255${digits.slice(1)}`;
  else if (digits.length === 9) digits = `255${digits}`;
  return /^255\d{9}$/.test(digits) ? digits : null;
}

/** wa.me link with the text pre-filled; null when the seller has no usable WhatsApp number. */
export function whatsappLink(storeWhatsApp: string | null | undefined, text: string): string | null {
  const number = whatsappNumber(storeWhatsApp);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null;
}
