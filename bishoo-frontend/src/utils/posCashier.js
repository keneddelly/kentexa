/**
 * "Badilisha mhudumu" (owner approved 2026-11-03): the cashiers of this till and who is on duty,
 * kept on this computer so the cashier can change without internet. A PIN is checked here against
 * the salted SHA-256 the server sent (GET /sales/pos/cashiers); the PIN itself is never stored.
 */
const LIST_KEY = 'kentexa_pos_cashiers';
const DUTY_KEY = 'kentexa_pos_on_duty';

export function saveCashiers(ownerUserId, cashiers) {
  try { localStorage.setItem(LIST_KEY, JSON.stringify({ ownerUserId, cashiers, savedAt: new Date().toISOString() })); } catch { /* private mode */ }
}
export function loadCashiers() {
  try { return JSON.parse(localStorage.getItem(LIST_KEY) || 'null')?.cashiers || []; } catch { return []; }
}
export function saveOnDuty(cashier) {
  try { if (cashier) localStorage.setItem(DUTY_KEY, JSON.stringify({ userId: cashier.userId, name: cashier.name })); else localStorage.removeItem(DUTY_KEY); } catch { /* private mode */ }
}
export function loadOnDuty() {
  try { return JSON.parse(localStorage.getItem(DUTY_KEY) || 'null'); } catch { return null; }
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** SHA-256(salt + pin) as the server makes it. */
export async function hashPin(salt, pin) {
  const data = new TextEncoder().encode(`${salt}${pin}`);
  const subtle = (typeof window !== 'undefined' && window.crypto && window.crypto.subtle);
  if (!subtle) return null;
  return hex(await subtle.digest('SHA-256', data));
}

export async function pinMatches(cashier, pin) {
  if (!cashier?.salt || !cashier?.pinHash || !/^\d{4}$/.test(String(pin))) return false;
  return (await hashPin(cashier.salt, String(pin))) === cashier.pinHash;
}
