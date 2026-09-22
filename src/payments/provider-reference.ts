import * as crypto from 'crypto';

/**
 * S0 — one server-generated provider reference format used for every
 * gateway request, compliant with the strictest documented constraint we
 * found (ClickPesa's orderReference: alphanumeric, max 20 characters).
 * Selcom's order_id has no documented length/charset limit, so reusing this
 * format there too costs nothing and keeps initiation code provider-
 * agnostic (Decision 8 — the server decides the reference, never the
 * frontend, and never a per-provider ad-hoc string built inline).
 */
export function generateProviderReference(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `K${ts}${rand}`.slice(0, 20);
}

export function isCompliantProviderReference(reference: string): boolean {
  return /^[A-Za-z0-9]{1,20}$/.test(reference);
}
