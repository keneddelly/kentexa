/**
 * Delivery prices at checkout from the shipment engine (owner 2026-10-25: "seller
 * should no longer set price"; "parcel shipping should be the same for all orders").
 *
 * The same discovery the send forms use (LogisticsServiceOfferService.discover):
 *   - same city: an agent collects at the seller's and delivers at the buyer's door
 *     (direct delivery), or an office that chose same-city delivery - the cheaper;
 *   - another city: the seller drops at an office and the buyer collects at the
 *     destination office - the cheapest priced office (offices are independent
 *     businesses; the office books the transport and keeps its fare).
 * A trip the engine cannot price is null, and the checkout does not offer it.
 * Never throws: an engine failure means "no price now", never a guessed number.
 *
 * Another city, several offices (owner 2026-11-09: "the exact shipping price from the office
 * price ... when many offices have different prices KenteXa should do better mathematics"):
 * the buyer pays the exact price of ONE real office, the best one (bestOffice below), and that
 * office is kept on the order so the seller's send form opens on it at the same price.
 */
export interface EngineFeeInput {
  fromCity: string;
  toCity: string;
  origin: string;
  destination: string;
  weightKg: number;
  sameCity: boolean;
  declaredValue?: number;
  /** Same city, when no agent has set a fee: KenteXa's own rate card (Dar), never the seller's. */
  rateCard?: () => Promise<number | null>;
  /** The seller's shop place (seller_pickup_place) and the buyer's picked place, when known. */
  originPlace?: { providerKey: string; providerPlaceId: string } | null;
  originPoint?: { latitude: number; longitude: number } | null;
  destinationPlace?: { providerKey: string; providerPlaceId: string } | null;
}

/** The office the buyer's shipping fee comes from: its exact price, never a mix of offices. */
export interface OfficePick {
  fee: number;
  officeId: number;
  officeName: string | null;
  officeCity: string | null;
  officeAddress: string | null;
  phone: string | null;
  /** How many offices had a price for this trip, and the lowest of them. */
  offices: number;
  cheapest: number;
}

export interface EngineFees {
  sameCity: number | null;
  intercity: number | null;
  office?: OfficePick | null;
}

/** Offices within this share of the cheapest price count as "about as cheap". */
export const BEST_OFFICE_PRICE_BAND = 0.15;
/** A rating counts only with this many ratings behind it. */
export const BEST_OFFICE_MIN_RATINGS = 3;

/**
 * The best office for the buyer (owner chose "best office", 2026-11-09). Plain rules, in order:
 *   1 only offices with a real price (more than 0);
 *   2 only those about as cheap as the cheapest (within 15%): the buyer never pays much more
 *     than the lowest real price;
 *   3 among those: the better rating (only with 3+ ratings), then the nearest to the seller,
 *     then the fewer days, then the lower price, then the engine's own order (paid-up first).
 * The fee is that office's exact price.
 */
export function bestOffice(list: any[]): OfficePick | null {
  const priced = (Array.isArray(list) ? list : [])
    .map((o, index) => ({ o, index, price: Number(o?.price), opt: o?.fulfillment?.officeOption || {} }))
    .filter((x) => x.o?.serviceType === 'office' && Number.isFinite(x.price) && x.price > 0 && Number(x.opt.officeId) > 0);
  if (!priced.length) return null;
  const cheapest = Math.min(...priced.map((x) => x.price));
  const band = priced.filter((x) => x.price <= cheapest * (1 + BEST_OFFICE_PRICE_BAND));
  const rating = (x: any) => (Number(x.opt.totalRatings) >= BEST_OFFICE_MIN_RATINGS && Number.isFinite(Number(x.opt.rating)) ? Number(x.opt.rating) : -1);
  const num = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? Infinity : Number(v));
  band.sort((a, b) => (rating(b) - rating(a))
    || (num(a.opt.distanceKm) - num(b.opt.distanceKm))
    || (num(a.opt.estimatedDays) - num(b.opt.estimatedDays))
    || (a.price - b.price)
    || (a.index - b.index));
  const best = band[0];
  return {
    fee: Math.round(best.price), officeId: Number(best.opt.officeId),
    officeName: best.opt.officeName ?? best.o.name ?? null, officeCity: best.opt.officeCity ?? null,
    officeAddress: best.opt.officeAddress ?? null, phone: best.opt.phone ?? null,
    offices: priced.length, cheapest: Math.round(cheapest),
  };
}

type Discover = { discover(dto: any): Promise<any[]> } | undefined | null;

const priced = (o: any): number | null => {
  const n = o?.price == null ? NaN : Number(o.price);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};
const cheapest = (list: any[]): number | null => {
  const prices = list.map(priced).filter((n): n is number => n != null);
  return prices.length ? Math.min(...prices) : null;
};

export async function engineDeliveryFees(engine: Discover, input: EngineFeeInput): Promise<EngineFees> {
  const none: EngineFees = { sameCity: null, intercity: null };
  if (!engine || !input.fromCity || !input.toCity) return none;
  try {
    const offers: any[] = await engine.discover({
      fromCity: input.fromCity, toCity: input.toCity, weightKg: Math.max(Number(input.weightKg) || 1, 0.1),
      pickup: input.sameCity ? 'door' : 'point', delivery: input.sameCity ? 'door' : 'collect',
      origin: input.originPlace ? { place: input.originPlace } : input.origin ? { text: input.origin } : undefined,
      destination: input.destinationPlace ? { place: input.destinationPlace } : input.destination ? { text: input.destination } : undefined,
      pickupPoint: input.originPoint || undefined,
      declaredValue: Number(input.declaredValue) > 0 ? Math.round(Number(input.declaredValue)) : undefined,
    });
    const list = Array.isArray(offers) ? offers : [];
    if (input.sameCity) {
      const direct = list.filter((o) => o?.serviceType === 'direct_delivery');
      const offices = list.filter((o) => o?.serviceType === 'office');
      // An agent who has not set a fee answers 0: that is not a price, the rate card is.
      const directFee = cheapest(direct.filter((o) => Number(o?.price) > 0));
      const card = direct.length && directFee == null && input.rateCard ? await input.rateCard().catch(() => null) : null;
      const fee = directFee ?? (Number(card) > 0 ? Math.round(Number(card)) : null) ?? cheapest(offices);
      return { sameCity: fee, intercity: null };
    }
    // The buyer faces an office, never a transporter directly (owner 2026-10-26).
    const office = bestOffice(list);
    return { sameCity: null, intercity: office ? office.fee : null, office };
  } catch {
    return none;
  }
}
