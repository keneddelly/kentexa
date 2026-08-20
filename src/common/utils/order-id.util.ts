import { BadRequestException } from '@nestjs/common';

// Every order's canonical, buyer-visible identifier is "KTX-ORD-{id}" — the
// number printed on receipts, sent in SMS, and shown on tracking links. A
// Super Agent naturally types or scans THAT number, not the raw database
// id, so any route a Super Agent enters an order number into must accept
// both forms rather than relying on ParseIntPipe (which only accepts a
// bare integer and 400s on the prefixed form everyone actually sees).
export function parseOrderIdParam(raw: string): number {
  const trimmed = (raw || '').trim();
  const stripped = trimmed.replace(/^KTX-ORD-/i, '');
  const id = Number(stripped);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestException(`Invalid order number: ${raw}`);
  }
  return id;
}
