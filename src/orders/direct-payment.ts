/**
 * Marketplace payment mode (owner 2026-10-19, migration 1792000000000).
 *
 * MARKETPLACE_PAYMENT_MODE (setting, default "cod_lipa"):
 *   cod_lipa  the buyer pays the seller directly. KenteXa holds no money:
 *             - same city (buyer region = seller region): "Lipa kwa mkono
 *               unapopokea" (COD) and "Lipa kwa Lipa Namba";
 *             - other city: "Lipa kwa Lipa Namba" only, no COD.
 *             The old online payment (and its screens) is refused.
 *   online    the old process (online payment, COD with deposit), kept as it
 *             was; only reachable by setting the value to "online".
 *
 * An order created in cod_lipa mode is stamped order.paymentMode = 'cod_lipa'.
 * The seller may prepare and ship it (they see their own Lipa Namba / take the
 * cash), but escrow release, payouts and wallet credit never apply to it.
 */
export type MarketplacePaymentMode = 'cod_lipa' | 'online';
export const DIRECT_PAYMENT_MODE = 'cod_lipa';

export function marketplacePaymentMode(env: Record<string, string | undefined> = process.env): MarketplacePaymentMode {
  return String(env.MARKETPLACE_PAYMENT_MODE ?? '').trim().toLowerCase() === 'online' ? 'online' : 'cod_lipa';
}

/** True for an order the buyer pays to the seller directly (KenteXa holds nothing). */
export function isDirectPaymentOrder(order: { paymentMode?: string | null } | null | undefined): boolean {
  return order?.paymentMode === DIRECT_PAYMENT_MODE;
}

export type DirectPaymentMethod = 'cod' | 'lipa_namba';

export interface DirectPaymentInput {
  sameCity: boolean;
  /** The seller's own per-product COD permission (Product.codEnabled). */
  codEnabled: boolean;
  /** Digital products have nothing to deliver, so nothing to pay on delivery. */
  digital: boolean;
  sellerHasLipaNamba: boolean;
}

/** Which ways to pay the checkout may offer in cod_lipa mode. */
export function directPaymentOptions(input: DirectPaymentInput): DirectPaymentMethod[] {
  const options: DirectPaymentMethod[] = [];
  if (input.sameCity && input.codEnabled && !input.digital) options.push('cod');
  if (input.sellerHasLipaNamba) options.push('lipa_namba');
  return options;
}

export const DIRECT_PAYMENT_MESSAGES = {
  onlineHidden: 'Malipo ya mtandaoni hayapatikani kwa sasa. Chagua kulipa kwa mkono unapopokea au kwa Lipa Namba ya muuzaji.',
  methodRequired: 'Chagua jinsi utakavyolipa.',
  codNotHere: 'Kulipa kwa mkono unapopokea kunapatikana tu muuzaji akiwa mkoa mmoja na wewe, na kama muuzaji ameruhusu kwa bidhaa hii.',
  noLipaNamba: 'Muuzaji huyu bado hajaweka Lipa Namba.',
  noWay: 'Bidhaa hii haiwezi kununuliwa kwa sasa: muuzaji hajaweka Lipa Namba, na kulipa kwa mkono hakupatikani kwa mahali pako.',
  onlinePayHidden: 'Malipo ya mtandaoni hayapatikani kwa sasa. Lipa muuzaji moja kwa moja.',
  notHeld: 'KenteXa haishikilii pesa ya agizo hili; muuzaji alilipwa moja kwa moja.',
  lipaNambaInvalid: 'Weka Lipa Namba sahihi (tarakimu 5 hadi 15).',
  lipaNambaNameInvalid: 'Weka jina ambalo Lipa Namba imesajiliwa nalo (herufi 2 hadi 100).',
} as const;

/** "123 456 78" -> "12345678"; null when not 5-15 digits. */
export function normalizeLipaNamba(value: unknown): string | null {
  const digits = String(value ?? '').replace(/[\s-]/g, '');
  return /^\d{5,15}$/.test(digits) ? digits : null;
}

export function normalizeLipaNambaName(value: unknown): string | null {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim();
  return name.length >= 2 && name.length <= 100 ? name : null;
}

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/\s+region$/, '').replace(/\s+/g, ' ');

/**
 * Same city = same region. By region id when both are known (the buyer's
 * checkout place list and the seller's profile use the same tz_region list),
 * else by region name. Unknown on either side = NOT the same city, so COD is
 * never offered on a guess.
 */
export function isSameRegion(
  buyer: { regionId?: number | null; regionName?: string | null },
  seller: { regionId?: number | null; regionName?: string | null },
): boolean {
  if (buyer.regionId && seller.regionId) return Number(buyer.regionId) === Number(seller.regionId);
  const a = norm(buyer.regionName), b = norm(seller.regionName);
  return !!a && !!b && a === b;
}
