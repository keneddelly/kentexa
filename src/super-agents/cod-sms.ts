/**
 * Cash on delivery for seller shipments (owner, 2026-10-22).
 * - COD is allowed only within one city (a boda delivers it). Intercity COD is refused.
 * - The buyer gets ONE text when the shipment is created: goods + boda fee = total,
 *   "Utalipa wakati wa kupokea", and how to pay. Never "Umelipa" for COD.
 * Plain GSM characters only, so a normal text stays one SMS (160 characters).
 * Pure: no database, no clock.
 */
import { isDarEsSalaam } from './office-price';

export const SMS_SINGLE_PART = 160;

export const COD_MESSAGES = {
  intercity: 'COD inaruhusiwa kwa mzigo wa ndani ya mji mmoja tu (boda). Kwa mji mwingine, mteja alipe kwanza kwa taslimu au simu.',
  fullyPaid: 'Mteja amelipa kiasi chote. Rekodi mauzo haya kama taslimu au pesa ya simu, si COD.',
  bodaFeeRequired: 'Weka ada ya boda ya kufikisha mzigo huu wa COD.',
  badBodaFee: 'Ada ya boda iwe 0 au zaidi.',
} as const;

const cityKey = (city: string | null | undefined) =>
  String(city || '').toLowerCase().replace(/[^a-z]/g, '');

/** True when origin and destination are the same city (Dar es Salaam however it is written). */
export function isSameCity(origin: string | null | undefined, destination: string | null | undefined): boolean {
  if (isDarEsSalaam(origin) && isDarEsSalaam(destination)) return true;
  const a = cityKey(origin);
  const b = cityKey(destination);
  return a.length >= 2 && a === b;
}

const tzs = (n: number) => `TZS ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

export interface CodText1Input {
  /** What the buyer still owes for the goods (the COD balance). */
  goods: number;
  /** True when the buyer already paid part of the goods: the goods line says "Salio la bidhaa". */
  partlyPaid?: boolean;
  /** The boda delivery fee the seller set. */
  bodaFee: number;
  /** The seller's Lipa Namba, when the seller offers one; otherwise cash only. */
  lipaNamba?: string | null;
  /** The parcel reference the buyer sees elsewhere (e.g. "Mzigo: 2610-0001234"). */
  reference?: string | null;
}

/** Text 1: the one COD text, sent right after the shipment is created. */
export function codText1(input: CodText1Input): string {
  const goods = Math.max(0, Number(input.goods) || 0);
  const boda = Math.max(0, Number(input.bodaFee) || 0);
  const lipa = String(input.lipaNamba || '').replace(/[^0-9]/g, '');
  const how = lipa ? `taslimu au Lipa Namba ${lipa}` : 'taslimu';
  const ref = input.reference ? ` ${String(input.reference).replace(/[^A-Za-z0-9 :\-]/g, '').trim()}.` : '';
  const text = `KenteXa: ${input.partlyPaid ? 'Salio la bidhaa' : 'Bidhaa'} ${tzs(goods)} + boda ${tzs(boda)} = Jumla ${tzs(goods + boda)}. ` +
    `Utalipa wakati wa kupokea: ${how}.`;
  // One SMS always: the parcel reference is the first thing to go when space runs out.
  return (text + ref).length <= SMS_SINGLE_PART ? text + ref : text;
}
