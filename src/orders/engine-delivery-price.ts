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
}

export interface EngineFees {
  sameCity: number | null;
  intercity: number | null;
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
      origin: input.origin ? { text: input.origin } : undefined,
      destination: input.destination ? { text: input.destination } : undefined,
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
    return { sameCity: null, intercity: cheapest(list.filter((o) => o?.serviceType === 'office' && Number(o?.price) > 0)) };
  } catch {
    return none;
  }
}
