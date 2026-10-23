/**
 * Cash on delivery for seller shipments (owner, 2026-10-22).
 * - COD is allowed only within one city (a boda delivers it). Intercity COD is refused.
 * - The buyer gets ONE text when the shipment is created, from the shop's name:
 *   item + usafiri = total, "Lipa ukipokea", and how to pay. Never "Umelipa" for COD.
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
  pickupPlaceRequired: 'Chagua mahali boda atachukua mzigo (duka lako) kwenye ramani.',
  pickupPlaceOtherCity: 'Mahali pa kuchukua mzigo lazima pawe ndani ya mji wa mzigo huu.',
  sellerPhoneRequired: 'Weka namba yako ya simu kwanza: boda atakupigia kuchukua mzigo.',
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

const amount = (n: number) => Math.round(Number(n) || 0).toLocaleString('en-US');

/** Plain GSM text only (no emoji, no curly quotes), single spaces. */
const gsmText = (v: string | null | undefined) =>
  String(v || '')
    .replace(/[‘’`´]/g, "'")
    .replace(/[^A-Za-z0-9 .,'&()\-/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Shorten to at most max characters, at a word boundary when one is close. */
const cutWords = (v: string, max: number) => {
  if (v.length <= max) return v;
  if (max <= 0) return '';
  const hard = v.slice(0, max);
  const space = hard.lastIndexOf(' ');
  const cut = (space >= 2 ? hard.slice(0, space) : hard).trim();
  // Never end on a joining word ("Televisheni ya", "Saa na").
  return cut.replace(/(\s+(ya|na|la|wa|za|kwa|cha|vya|pamoja|and|&|-|,))+$/i, '').trim();
};

export interface CodText1Input {
  /** What the buyer still owes for the goods (the COD balance). */
  goods: number;
  /** True when the buyer already paid part of the goods: the goods line says "salio". */
  partlyPaid?: boolean;
  /** The boda delivery fee the seller set. */
  bodaFee: number;
  /** The seller's Lipa Namba, when the seller offers one; otherwise cash only. */
  lipaNamba?: string | null;
  /** The shop name the buyer knows (the seller's store or business name). */
  shopName?: string | null;
  /** What the buyer ordered (e.g. "Saa ya ukutani"). */
  itemName?: string | null;
  /** The number the buyer tracks with (e.g. "KTX 8822 3997 65"). */
  reference?: string | null;
}

/**
 * Text 1: the one COD text, sent right after the shipment is created.
 * Owner's wording (2026-10-22):
 *   "Oda yako kwa BIS imethibitishwa: Saa ya ukutani 300,000 + usafiri 2,000 =
 *    TZS 302,000. Lipa ukipokea: taslimu au Lipa 5808450. Fuatilia: KTX 8822 3997 65"
 * Always one SMS: long names are shortened at whole words; the tracking line goes
 * only when nothing else fits. Amounts and how to pay always stay.
 */
export function codText1(input: CodText1Input): string {
  const goods = Math.max(0, Number(input.goods) || 0);
  const boda = Math.max(0, Number(input.bodaFee) || 0);
  const lipa = String(input.lipaNamba || '').replace(/[^0-9]/g, '');
  const how = lipa ? `taslimu au Lipa ${lipa}` : 'taslimu';
  const ref = gsmText(input.reference);
  const fullShop = gsmText(input.shopName);
  const fullItem = gsmText(input.itemName) || 'Bidhaa';

  const build = (shop: string, item: string, withRef: boolean) => {
    const head = shop ? `Oda yako kwa ${shop} imethibitishwa: ` : 'Oda yako imethibitishwa: ';
    const goodsPart = `${item || 'Bidhaa'}${input.partlyPaid ? ' salio' : ''} ${amount(goods)}`;
    return `${head}${goodsPart} + usafiri ${amount(boda)} = TZS ${amount(goods + boda)}. ` +
      `Lipa ukipokea: ${how}.` + (withRef && ref ? ` Fuatilia: ${ref}` : '');
  };
  // Always one SMS. Try the full shop name first, then shorter ones; for each,
  // the item gets whatever room is left (whole words), else "Bidhaa". The
  // tracking line goes only when nothing else fits. Amounts and how to pay always stay.
  const shops = Array.from(new Set([cutWords(fullShop, 24), cutWords(fullShop, 16), cutWords(fullShop, 10)]));
  for (const withRef of [true, false]) {
    for (const shop of shops) {
      const room = SMS_SINGLE_PART - build(shop, '', withRef).length;
      const item = cutWords(fullItem, room);
      if (item.length >= 4 && (item === fullItem || item.length >= 8)) return build(shop, item, withRef);
      if (room >= 'Bidhaa'.length) return build(shop, 'Bidhaa', withRef);
    }
  }
  return build(cutWords(fullShop, 10), 'Bidhaa', false);
}
