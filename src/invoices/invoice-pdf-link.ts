import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signed invoice / receipt download links (owner 2026-11-09 audit: anyone could download every
 * invoice and receipt PDF, with the buyer's email, phone and address, because the numbers run in
 * order and the download needed no sign-in). Now the PDF routes need `?e=<expiry>&k=<signature>`;
 * only GET .../pdf-link gives one, after checking the caller is the buyer, the seller or KenteXa
 * staff. A link works for 15 minutes, for that one document.
 */
export const PDF_LINK_TTL_SECONDS = 15 * 60;
type Kind = 'invoice' | 'receipt';

const key = () => `invoice-pdf:${process.env.JWT_SECRET || ''}`;
const sign = (kind: Kind, number: string, exp: number) =>
  createHmac('sha256', key()).update(`${kind}|${number}|${exp}`).digest('base64url');

export function signPdfQuery(kind: Kind, number: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + PDF_LINK_TTL_SECONDS;
  return `e=${exp}&k=${sign(kind, number, exp)}`;
}

export function verifyPdfQuery(kind: Kind, number: string, e: unknown, k: unknown, now = Date.now()): boolean {
  const exp = Number(e);
  if (!process.env.JWT_SECRET || !Number.isSafeInteger(exp) || exp < Math.floor(now / 1000) || typeof k !== 'string' || !k) return false;
  const want = Buffer.from(sign(kind, number, exp));
  const got = Buffer.from(k);
  return want.length === got.length && timingSafeEqual(want, got);
}
