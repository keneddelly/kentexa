/**
 * Office price rule (owner, 2026-10-21; NEXT_STEPS section 12). Each Super Agent office
 * sets HOW it charges for transport: a percent of the goods value (mostly 10%, with a
 * minimum of 5,000 TZS) or by kg (its existing per-destination rates in shipping_rate).
 * By kg, a town with no shipping_rate row is refused (NoDestinationRateError): the office
 * sets a rate for that town first. There is no percent fallback (owner 2026-10-21).
 * One calculation gives pickup, transport, delivery and total, so the offer, the counter
 * preview, the receipt and the invoice all show the same numbers.
 *
 * Pickup / delivery: in Dar es Salaam an agent's pickup or door delivery is the existing
 * boda boda fee (the admin boda rate table, zone to zone); 0 shows as "Bure". Elsewhere
 * they are "not included" here: any agent or van fee is charged as today, separately.
 *
 * Same-city parcels in Dar es Salaam (agent delivery from a Dar office) pay ONLY the boda
 * boda fee: no transport line, no percent, no minimum (owner 2026-10-21).
 *
 * Every amount is rounded UP to the nearest 100 TZS. Pure: no database, no clock.
 */

export type ChargeMode = 'value' | 'kg';
export const DEFAULT_VALUE_PERCENT = 10;
export const DEFAULT_VALUE_MINIMUM = 5000;
export const DEFAULT_CURRENCY = 'TZS';
export const DEFAULT_COUNTRY = 'TZ';

export interface OfficePriceRuleInput {
  chargeMode: ChargeMode;
  valuePercent: number;
  valueMinimum: number;
  currency?: string;
}

export interface KgRateInput { ratePerKg: number; minimumCharge: number }

/** 'not_included' = not part of this office's price (sender brought it / charged separately). */
export type LineStatus = 'not_included' | 'free' | 'charged';
export interface PriceLine { status: LineStatus; amount: number; source?: 'boda' }

export interface OfficePriceQuote {
  pickup: PriceLine;
  /** mode 'same_city': a same-city parcel in Dar, which pays only the boda fee (amount 0). */
  transport: { amount: number; mode: ChargeMode | 'same_city'; percent?: number; minimum: number; ratePerKg?: number; weightKg?: number };
  delivery: PriceLine;
  total: number;
  currency: string;
  /** 'office' = the office's own rule; 'default' = no rule saved yet (10%, minimum 5,000). */
  ruleSource: 'office' | 'default';
}

/** A by-kg office has no shipping_rate row for the parcel's town. */
export class NoDestinationRateError extends Error {
  constructor() { super('NO_DESTINATION_RATE'); this.name = 'NoDestinationRateError'; }
}

export const roundUpTo100 = (n: number): number => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.ceil(Math.round(v * 100) / 100 / 100) * 100;   // round cents first: 5000.0000001 stays 5000
};

export const defaultRule = (): OfficePriceRuleInput => ({
  chargeMode: 'value', valuePercent: DEFAULT_VALUE_PERCENT, valueMinimum: DEFAULT_VALUE_MINIMUM, currency: DEFAULT_CURRENCY,
});

/** Boda line: undefined = not included; a number = the boda fee ("Bure" when 0). */
const bodaLine = (fee: number | null | undefined): PriceLine => {
  if (fee == null || !Number.isFinite(Number(fee))) return { status: 'not_included', amount: 0 };
  const amount = roundUpTo100(Number(fee));
  return amount > 0 ? { status: 'charged', amount, source: 'boda' } : { status: 'free', amount: 0, source: 'boda' };
};

export interface QuoteInput {
  rule: OfficePriceRuleInput | null;
  /** The office's own rate for this destination (by-kg offices), if it has one. */
  kgRate: KgRateInput | null;
  declaredValue: number;
  weightKg?: number | null;
  /** Dar boda fee for an agent pickup / door delivery; null/undefined = not included. */
  pickupBodaFee?: number | null;
  deliveryBodaFee?: number | null;
  /** Same-city parcel in Dar es Salaam: only the boda fee, no transport charge. */
  sameCityDar?: boolean;
}

export function quoteOfficePrice(input: QuoteInput): OfficePriceQuote {
  const rule = input.rule ?? defaultRule();
  const value = Math.max(0, Number(input.declaredValue) || 0);
  const weight = Math.max(0, Number(input.weightKg) || 0);

  let transport: OfficePriceQuote['transport'];
  if (input.sameCityDar) {
    transport = { amount: 0, mode: 'same_city', minimum: 0 };
  } else if (rule.chargeMode === 'kg') {
    if (!input.kgRate || !(Number(input.kgRate.ratePerKg) > 0)) throw new NoDestinationRateError();
    const minimum = roundUpTo100(Number(input.kgRate.minimumCharge) || 0);
    transport = {
      amount: Math.max(roundUpTo100(weight * Number(input.kgRate.ratePerKg)), minimum),
      mode: 'kg', minimum, ratePerKg: Number(input.kgRate.ratePerKg), weightKg: weight,
    };
  } else {
    const minimum = roundUpTo100(Number(rule.valueMinimum) || 0);
    const percent = Number(rule.valuePercent) || 0;
    transport = { amount: Math.max(roundUpTo100((value * percent) / 100), minimum), mode: 'value', percent, minimum };
  }

  const pickup = bodaLine(input.pickupBodaFee);
  const delivery = bodaLine(input.deliveryBodaFee);
  return {
    pickup, transport, delivery,
    total: pickup.amount + transport.amount + delivery.amount,
    currency: rule.currency || DEFAULT_CURRENCY,
    ruleSource: input.rule ? 'office' : 'default',
  };
}

export const PRICE_CHANGE_REASON_MIN = 3;

/**
 * The agent may charge a different amount than the calculation, but only with a saved
 * reason. Returns the reason to save (null when the charged amount equals the total).
 */
export function checkChargedAmount(quote: Pick<OfficePriceQuote, 'total'>, charged: number, reason: unknown): { changed: boolean; reason: string | null } {
  const amount = Number(charged);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('INVALID_AMOUNT');
  if (amount === quote.total) return { changed: false, reason: null };
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length < PRICE_CHANGE_REASON_MIN) throw new Error('REASON_REQUIRED');
  return { changed: true, reason: text.slice(0, 300) };
}

const tzs = (n: number, currency = DEFAULT_CURRENCY) => `${currency} ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const lineText = (line: PriceLine | undefined, currency: string) =>
  !line || line.status === 'not_included' ? 'Haihusiki (not included)'
    : line.status === 'free' ? 'Bure (free)' : tzs(line.amount, currency);

/** The receipt / invoice lines for a saved breakdown: pickup, transport, delivery, total. */
export function breakdownReceiptLines(b: any): { label: string; value: string }[] {
  if (!b || typeof b !== 'object' || !b.transport) return [];
  const currency = b.currency || DEFAULT_CURRENCY;
  const lines = [
    { label: 'Kuchukua (pickup)', value: lineText(b.pickup, currency) },
    { label: 'Usafirishaji (transport)', value: b.transport.mode === 'same_city' ? 'Haihusiki (not included)' : tzs(b.transport.amount, currency) },
    { label: 'Kufikisha (delivery)', value: lineText(b.delivery, currency) },
    { label: 'Jumla (total)', value: tzs(b.total, currency) },
  ];
  if (b.changed) {
    lines.push({ label: 'Imelipwa (charged)', value: tzs(b.charged, currency) });
    lines.push({ label: 'Sababu (reason)', value: String(b.changeReason || '').slice(0, 60) });
  }
  return lines;
}

/** True when an office city / region is Dar es Salaam. */
export const isDarEsSalaam = (place: string | null | undefined): boolean =>
  /\bdar(\s|-|_)*es(\s|-|_)*salaa?m\b|^\s*dar\s*$/i.test(String(place || ''));
