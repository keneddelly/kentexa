/**
 * Office offers for the customer send form (owner 2026-10-23): "the main players of
 * the game are the Super Agents" -- every office that ships from the sender's city to
 * the destination competes with its own price, next to the transporters.
 *
 * An office serves a destination when it has an ACTIVE shipping rate row for it
 * (the per-destination rates each office sets on its "Bei" page). Its price is its
 * own price rule (% of the declared value with a minimum, or per kg from that rate),
 * quoted by the same OfficePriceService the office counter uses. Training and
 * inactive offices never appear. Pure helpers here; queries in the service.
 */
import { isSameCity } from '../super-agents/cod-sms';

export const OFFICE_SERVICE_PATH = 'office_routed';

export interface OfficeRateRow {
  officeId: number;
  businessName: string;
  officeCity: string;
  officeAddress: string | null;
  rating: number | null;
  totalRatings: number | null;
  destinationCity: string;
  ratePerKg: number;
  minimumCharge: number;
  estimatedDays: number | null;
}

const key = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z]/g, '');

/** Does a rate row's destination name the place the sender chose (its region or district)? */
export function rateServesDestination(rateCity: string, destination: { regionName?: string | null; districtName?: string | null; city?: string | null }): boolean {
  const r = key(rateCity);
  if (r.length < 2) return false;
  return [destination.regionName, destination.districtName, destination.city]
    .some((name) => {
      const k = key(name);
      return k.length >= 2 && (k === r || isSameCity(rateCity, String(name ?? '')) || k.replace(/mjini$/, '') === r);
    });
}

/** Is the office in the sender's city (region or district)? */
export function officeServesOrigin(officeCity: string, origin: { regionName?: string | null; districtName?: string | null; city?: string | null }): boolean {
  return [origin.regionName, origin.districtName, origin.city].some((name) => name && isSameCity(officeCity, name));
}

/**
 * One rate row per office: the best match for this destination (an exact district
 * name beats the region), so an office never appears twice.
 */
export function pickOfficeRates(rows: OfficeRateRow[], origin: Record<string, any>, destination: Record<string, any>): OfficeRateRow[] {
  const byOffice = new Map<number, OfficeRateRow>();
  for (const row of rows) {
    if (!officeServesOrigin(row.officeCity, origin) || !rateServesDestination(row.destinationCity, destination)) continue;
    const prev = byOffice.get(row.officeId);
    const exactDistrict = key(row.destinationCity) === key(destination.districtName);
    if (!prev || (exactDistrict && key(prev.destinationCity) !== key(destination.districtName))) byOffice.set(row.officeId, row);
  }
  return [...byOffice.values()];
}

/** "Siku 2" style arrival text from the office's own estimate. */
export function officeEtaLabel(days: number | null | undefined): string {
  const d = Number(days);
  if (!Number.isFinite(d) || d <= 0) return 'Ofisi itakujulisha';
  return d === 1 ? 'Inafika baada ya siku 1' : `Inafika baada ya siku ${Math.round(d)}`;
}

/** How the office charges, in plain Swahili, from its quote. */
export function officeChargeText(transport: { mode: string; percent?: number; minimum?: number; ratePerKg?: number }): string {
  const tzs = (n: number) => `TZS ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
  if (transport.mode === 'kg' && transport.ratePerKg) {
    return `${tzs(transport.ratePerKg)} kwa kg` + (transport.minimum ? ` · chini kabisa ${tzs(transport.minimum)}` : '');
  }
  if (transport.mode === 'value' && transport.percent) {
    return `${transport.percent}% ya thamani` + (transport.minimum ? ` · chini kabisa ${tzs(transport.minimum)}` : '');
  }
  return '';
}

// ── Office pickup offer (owner 2026-10-23) ────────────────────────────────────
// An office may collect from the sender itself: free, or for its own fee, and
// optionally only within maxKm of its own point. Table office_pickup_offer
// (migration 1792700000000); until it exists every office is "does not collect".

export type OfficePickupMode = 'none' | 'free' | 'fixed';
export interface OfficePickupOffer { mode: OfficePickupMode; fee: number | null; maxKm: number | null }

export const OFFICE_PICKUP_MESSAGES = {
  badMode: 'Chagua: sichukui, nachukua bure, au nachukua kwa bei.',
  badFee: 'Weka bei ya kuchukua (zaidi ya 0, isizidi TZS 1,000,000).',
  badKm: 'Umbali uwe kati ya km 1 na 200, au uache wazi.',
  notReady: 'Huduma hii bado haijawashwa. Jaribu tena baadaye.',
} as const;

/** Validates what an office sends from its settings; throws a message key on error. */
export function readOfficePickupInput(dto: any): OfficePickupOffer {
  const mode = String(dto?.mode || '') as OfficePickupMode;
  if (!['none', 'free', 'fixed'].includes(mode)) throw new Error('badMode');
  let fee: number | null = null;
  if (mode === 'fixed') {
    fee = Math.round(Number(dto?.fee));
    if (!Number.isFinite(fee) || fee <= 0 || fee > 1_000_000) throw new Error('badFee');
  }
  let maxKm: number | null = null;
  if (dto?.maxKm !== undefined && dto?.maxKm !== null && String(dto.maxKm).trim() !== '') {
    maxKm = Math.round(Number(dto.maxKm));
    if (!Number.isFinite(maxKm) || maxKm < 1 || maxKm > 200) throw new Error('badKm');
  }
  return { mode, fee, maxKm };
}

const toRad = (d: number) => (d * Math.PI) / 180;
/** Straight-line distance in km. */
export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const point = (lat: unknown, lng: unknown) => {
  const latitude = Number(lat); const longitude = Number(lng);
  return lat != null && lng != null && Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
};

/**
 * The fee the office charges to collect from this sender, or null when it does not
 * collect here. With a distance limit, both points must be known and within it.
 */
export function officePickupFeeFor(
  offer: OfficePickupOffer | null | undefined,
  office: { latitude?: unknown; longitude?: unknown },
  sender: { latitude?: unknown; longitude?: unknown } | null | undefined,
): number | null {
  if (!offer || offer.mode === 'none') return null;
  if (offer.maxKm != null) {
    const o = point(office.latitude, office.longitude);
    const s = sender ? point(sender.latitude, sender.longitude) : null;
    if (!o || !s || distanceKm(o, s) > offer.maxKm) return null;
  }
  return offer.mode === 'free' ? 0 : Number(offer.fee) || null;
}

// Does the table exist yet? Checked at most once a minute.
let pickupReady = false;
let pickupCheckedAt = 0;
export async function officePickupTableReady(db: { query: (sql: string, p?: any[]) => Promise<any> }, force = false, now = Date.now()) {
  if (pickupReady || (!force && now - pickupCheckedAt < 60_000)) return pickupReady;
  pickupCheckedAt = now;
  try {
    pickupReady = !!(await db.query(`SELECT to_regclass('public.office_pickup_offer') IS NOT NULL AS ok`))?.[0]?.ok;
  } catch { pickupReady = false; }
  return pickupReady;
}
/** Tests only. */
export function setOfficePickupReadyForTests(ready: boolean) { pickupReady = ready; pickupCheckedAt = ready ? Date.now() : 0; }

// ── Same-city trips (owner 2026-10-24) ────────────────────────────────────────
// Inside one city an agent or a transporter carries the parcel; an office is not
// needed. An office appears there only when it has chosen same-city delivery
// (office_pickup_offer."sameCityDelivery", migration 1792800000000).

/** Is this trip inside one city (Kariakoo -> Mbezi is Dar es Salaam -> Dar es Salaam)? */
export function isSameCityTrip(
  fromCity: string | null | undefined, toCity: string | null | undefined,
  origin?: { regionName?: string | null } | null, destination?: { regionName?: string | null } | null,
): boolean {
  if (isSameCity(fromCity, toCity)) return true;
  return !!(origin?.regionName && destination?.regionName && isSameCity(origin.regionName, destination.regionName));
}

let sameCityReady = false;
let sameCityCheckedAt = 0;
/** Does the "sameCityDelivery" column exist yet? Checked at most once a minute. */
export async function officeSameCityColumnReady(db: { query: (sql: string, p?: any[]) => Promise<any> }, force = false, now = Date.now()) {
  if (sameCityReady || (!force && now - sameCityCheckedAt < 60_000)) return sameCityReady;
  sameCityCheckedAt = now;
  try {
    sameCityReady = !!(await db.query(`SELECT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'office_pickup_offer' AND column_name = 'sameCityDelivery') AS ok`))?.[0]?.ok;
  } catch { sameCityReady = false; }
  return sameCityReady;
}
/** Tests only. */
export function setOfficeSameCityReadyForTests(ready: boolean) { sameCityReady = ready; sameCityCheckedAt = ready ? Date.now() : 0; }
