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
