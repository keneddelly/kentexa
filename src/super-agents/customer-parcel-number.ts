/**
 * The ONE parcel number a customer sees (NEXT_STEPS.md section 1).
 *
 * From the moment set in WAYBILL_CUSTOMER_FROM, a new parcel shows its
 * waybill ("KTX 9815 9515 21") on the receipt and in every SMS, from intake
 * to delivery. A parcel created before that moment keeps its old KTX-ORD-…
 * number on everything until it is delivered, so no customer sees their
 * number change mid-journey. Not set (or unreadable) = KTX-ORD everywhere,
 * exactly as before. Every lookup accepts both numbers either way
 * (resolveParcelTrackingNumber).
 */
import { formatWaybill } from '../shipments/waybill';

export interface ParcelNumbers {
  trackingNumber?: string | null;
  waybillNumber?: string | null;
  createdAt?: Date | string | null;
}

/**
 * WAYBILL_CUSTOMER_FROM as a moment in time, or null (= feature off).
 * Written like "2026-10-13T08:00:00+03:00". A value without a time zone is
 * read as Tanzania time (UTC+3), never as the server's UTC clock.
 */
export function readWaybillCustomerFrom(env: NodeJS.ProcessEnv = process.env): Date | null {
  let raw = String(env.WAYBILL_CUSTOMER_FROM ?? '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) raw += 'T00:00:00';
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(raw)) raw = raw.replace(' ', 'T') + '+03:00';
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time) : null;
}

function usesWaybill(parcel: ParcelNumbers, from: Date | null): boolean {
  if (!from || !parcel.waybillNumber || !parcel.createdAt) return false;
  const created = new Date(parcel.createdAt).getTime();
  return Number.isFinite(created) && created >= from.getTime();
}

/** The number printed and sent to the customer: "KTX 9815 9515 21" or "KTX-ORD-1234". */
export function customerParcelNumber(parcel: ParcelNumbers, from: Date | null = readWaybillCustomerFrom()): string {
  if (usesWaybill(parcel, from)) return formatWaybill(parcel.waybillNumber);
  return parcel.trackingNumber ?? '';
}

/** The same number without spaces, for links such as /?track=… */
export function customerTrackRef(parcel: ParcelNumbers, from: Date | null = readWaybillCustomerFrom()): string {
  if (usesWaybill(parcel, from)) return parcel.waybillNumber as string;
  return parcel.trackingNumber ?? '';
}

/**
 * An office / business name made safe for an SMS. One curly apostrophe or
 * emoji in a name switches the WHOLE message from GSM-7 (160 characters per
 * part) to UCS-2 (70 per part), so every message from that office would cost
 * more. Used inside SMS texts only; the name stays unchanged everywhere else.
 */
export function smsSafeName(name: string | null | undefined): string {
  if (!name) return '';
  return String(name)
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[–—―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[   ]/g, ' ')
    .replace(/\p{Extended_Pictographic}|\p{Regional_Indicator}|[‍︎️⃣]|[\u{1F3FB}-\u{1F3FF}]/gu, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
