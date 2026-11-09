import { BadRequestException } from '@nestjs/common';

/**
 * "Uza tena" (resell), owner approved 2026-11-09. Pure rules shared by the resale screens and
 * by checkout, so the price a reseller sets and the price an order charges follow one rule.
 *
 *   supplier price  product.resalePrice: what the reseller pays the supplier for one
 *   lowest price    product.resaleMinPrice: the supplier's floor for the selling price (optional)
 *   selling price   resale_offer.price: the reseller's own price on top; what the buyer pays
 *
 * The order stays the supplier's order. It carries the reseller and the amounts, and after
 * delivery the supplier owes the reseller (selling price - supplier price) x quantity.
 */
export const RESALE_NOTE_MAX = 200;

/** The supplier pays the reseller's profit within this many days of delivery (owner 2026-11-09). */
export const PAY_DAYS = 3;
/** A supplier with a profit unpaid this many days after delivery gets no new resale orders. */
export const STOP_DAYS = 7;
const DAY = 24 * 3600_000;

/**
 * Where one resale order's profit stands. The order's own status and the profit record decide it;
 * nothing is guessed.
 *   waiting    not delivered yet: nothing owed
 *   owed       delivered, the supplier should pay within PAY_DAYS
 *   late       delivered more than PAY_DAYS ago, still unpaid
 *   paid       the supplier says paid (with a reference); the reseller has not answered
 *   confirmed  the reseller confirmed receiving it
 *   disputed   the reseller says not received
 *   on_hold    the buyer disputed the order
 *   cancelled  cancelled: nothing owed
 */
export type ProfitState = 'waiting' | 'owed' | 'late' | 'paid' | 'confirmed' | 'disputed' | 'on_hold' | 'cancelled';

export function profitState(o: {
  status?: string | null; deliveredAt?: Date | string | null; completedAt?: Date | string | null;
  resellerPaidAt?: unknown; resellerConfirmedAt?: unknown; resellerDisputedAt?: unknown;
}, now = Date.now()): ProfitState {
  const status = String(o.status || '');
  if (status === 'cancelled') return 'cancelled';
  if (status === 'disputed') return 'on_hold';
  if (status !== 'delivered' && status !== 'completed') return 'waiting';
  if (o.resellerConfirmedAt) return 'confirmed';
  if (o.resellerDisputedAt) return 'disputed';
  if (o.resellerPaidAt) return 'paid';
  const at = new Date((o.deliveredAt || o.completedAt) as any).getTime();
  return Number.isFinite(at) && now - at > PAY_DAYS * DAY ? 'late' : 'owed';
}

/** SQL: resale profits this supplier left unpaid more than STOP_DAYS after delivery (alias p = product). */
export const UNPAID_LATE_SQL = `(SELECT COUNT(*) FROM public."order" r
  WHERE r."sellerId" = p."sellerId" AND r."resellerUserId" IS NOT NULL AND r."resellerPaidAt" IS NULL
    AND r.status::text IN ('delivered', 'completed')
    AND COALESCE(r."deliveredAt", r."completedAt") < now() - interval '${STOP_DAYS} days')`;

export const money = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

/** The lowest selling price a reseller may set: the supplier price, or the supplier's floor if higher. */
export const sellingFloor = (p: { resalePrice?: unknown; resaleMinPrice?: unknown }): number =>
  Math.max(money(p.resalePrice), money(p.resaleMinPrice));

/** What the reseller earns on one order. */
export const resellerProfit = (sellingUnit: unknown, supplierUnit: unknown, quantity: unknown): number =>
  money((money(sellingUnit) - money(supplierUnit)) * Math.max(1, Math.floor(Number(quantity) || 1)));

/** The supplier's resale terms, checked when it saves its product. */
export function assertResaleTerms(t: { resaleOpen?: unknown; resalePrice?: unknown; resaleMinPrice?: unknown }, publicPrice: unknown): void {
  const price = t.resalePrice == null ? null : money(t.resalePrice);
  const floor = t.resaleMinPrice == null ? null : money(t.resaleMinPrice);
  if (t.resaleOpen === true && !(price && price > 0)) {
    throw new BadRequestException('Weka bei ya wauzaji (wanayokulipa wewe) kabla ya kufungua bidhaa kwa wauzaji.');
  }
  if (price != null && price < 0) throw new BadRequestException('Bei ya wauzaji haiwezi kuwa chini ya sifuri.');
  const pub = money(publicPrice);
  if (price != null && pub > 0 && price > pub) {
    throw new BadRequestException('Bei ya wauzaji iwe chini ya bei yako ya duka, ili wapate faida.');
  }
  if (floor != null && price != null && floor > 0 && floor < price) {
    throw new BadRequestException('Bei ya chini ya kuuza haiwezi kuwa chini ya bei ya wauzaji.');
  }
}

/** A reseller's selling price: never below the floor. */
export function assertSellingPrice(price: unknown, product: { resalePrice?: unknown; resaleMinPrice?: unknown }): number {
  const p = money(price);
  const floor = sellingFloor(product);
  if (!(p > 0)) throw new BadRequestException('Weka bei yako ya kuuza.');
  if (p < floor) throw new BadRequestException(`Bei yako isiwe chini ya TZS ${Math.round(floor).toLocaleString('en-US')}.`);
  return p;
}

export interface OrderResale {
  resaleOfferId: number;
  resellerUserId: number;
  resaleUnitPrice: number;
  supplierUnitPrice: number;
}

type Query = (sql: string, params: any[]) => Promise<any[]>;

/**
 * The resale side of one order line, checked again at order time on the server: the offer is
 * on, it is for this product, the product is still open, the selling price is still at or above
 * the supplier's floor, and the buyer is not the reseller. Never trusts a price from the browser.
 */
export async function resaleForOrder(query: Query, offerId: unknown, productId: number, buyerId: number | null): Promise<OrderResale | null> {
  if (offerId == null || offerId === '') return null;
  const id = Number(offerId);
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('Ofa ya muuzaji si sahihi.');
  const [row] = await query(
    `SELECT o.id, o."productId", o."resellerUserId", o.price, o."isActive",
            p."resaleOpen", p."resalePrice", p."resaleMinPrice", p."sellerId",
            ${UNPAID_LATE_SQL} AS "unpaidLate"
       FROM public.resale_offer o JOIN public.product p ON p.id = o."productId"
      WHERE o.id = $1::int`, [id]);
  if (!row || !row.isActive || Number(row.productId) !== Number(productId)) {
    throw new BadRequestException('Ofa hii ya muuzaji haipo tena. Agiza kwa bei ya duka, au muulize muuzaji.');
  }
  if (!row.resaleOpen || !(money(row.resalePrice) > 0)) {
    throw new BadRequestException('Bidhaa hii haiuzwi tena na wauzaji. Agiza kwa bei ya duka.');
  }
  if (buyerId != null && Number(row.resellerUserId) === Number(buyerId)) {
    throw new BadRequestException('Huwezi kuagiza kutoka kwenye ofa yako mwenyewe.');
  }
  // Owner 2026-11-09: a supplier that left a reseller's profit unpaid 7 days gets no new resale orders.
  if (Number(row.unpaidLate) > 0) {
    throw new BadRequestException('Duka hili bado halijawalipa wauzaji faida zao. Agiza kwa bei ya duka, au jaribu baadaye.');
  }
  if (money(row.price) < sellingFloor(row)) {
    throw new BadRequestException('Bei ya muuzaji imebadilika. Muulize muuzaji akupe kiungo kipya.');
  }
  return {
    resaleOfferId: id,
    resellerUserId: Number(row.resellerUserId),
    resaleUnitPrice: money(row.price),
    supplierUnitPrice: money(row.resalePrice),
  };
}
