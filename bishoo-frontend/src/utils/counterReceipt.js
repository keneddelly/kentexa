// Super Agent counter: keep a walk-in receipt reachable (KNOWN_FAULTS #15)
// and show the recipient handover as its own action (KNOWN_FAULTS #19).

// Shown wherever the office sees a receipt. The claim code is issued once
// and is never stored in readable form, so it cannot be shown again.
export const CLAIM_CODE_NOTE = 'Namba ya siri ya mteja ya kudai mzigo haiwezi kuonyeshwa tena.';
// Hidden until Release C: today the code is never shown at all, so "cannot be
// shown again" would mislead the office (KNOWN_FAULTS #20). Release C shows the
// code once and prints it; then this note is switched on.
export const SHOW_CLAIM_CODE_NOTE = false;

export const walkResultStorageKey = (officeId) => `kentexa-walkin-last:${officeId}`;

// The number the customer holds (waybill from WAYBILL_CUSTOMER_FROM on, else
// KTX-ORD) — shown first on the counter, so staff read out the same number.
export const displayParcelNumber = (p) => (p && (p.customerNumber || p.trackingNumber)) || '';

// Staff-only extra numbers for the same parcel, e.g. "KTX-ORD-129".
export function otherParcelNumbers(p, formatWaybill) {
  if (!p) return [];
  const shown = displayParcelNumber(p);
  const wb = p.waybillNumber ? formatWaybill(p.waybillNumber) : '';
  return [p.trackingNumber, wb].filter((n) => n && n !== shown);
}

// What may be kept in the browser after a walk-in: the receipt shown on the
// screen, never the claim secret.
export function storableWalkResult(result) {
  if (!result || !result.trackingNumber) return null;
  const { shipmentClaim, ...rest } = result; // eslint-disable-line no-unused-vars
  return rest;
}

export function saveLastWalkResult(officeId, result) {
  const value = storableWalkResult(result);
  if (!officeId || !value) return;
  try { sessionStorage.setItem(walkResultStorageKey(officeId), JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export function loadLastWalkResult(officeId) {
  if (!officeId) return null;
  try { return storableWalkResult(JSON.parse(sessionStorage.getItem(walkResultStorageKey(officeId)) || 'null')); }
  catch { return null; }
}

export function clearLastWalkResult(officeId) {
  if (!officeId) return;
  try { sessionStorage.removeItem(walkResultStorageKey(officeId)); } catch { /* storage unavailable */ }
}

// Same rule as the handover block in the status sheet: arrived here, this
// office is not the sender's office, and the buyer did not ask for door delivery.
export function canHandOverToRecipient(parcel) {
  return Boolean(parcel) && parcel.buyerRequestedDelivery !== true &&
    ['arrived_at_hub', 'awaiting_buyer'].includes(parcel.status) &&
    parcel.myRole !== 'origin';
}

// Only the office that received the parcel holds its counter receipt.
export function canReopenReceipt(parcel) {
  return Boolean(parcel) && parcel.myRole !== 'destination';
}

// Historia search: waybill, parcel number, names and phones.
export function historiaMatches(parcel, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const compactQ = q.replace(/[\s-]/g, '');
  return [parcel.waybillNumber, parcel.trackingNumber, parcel.senderName, parcel.recipientName,
    parcel.senderPhone, parcel.buyerPhone]
    .filter(Boolean)
    .some((v) => {
      const s = String(v).toLowerCase();
      return s.includes(q) || (compactQ !== '' && s.replace(/[\s-]/g, '').includes(compactQ));
    });
}
