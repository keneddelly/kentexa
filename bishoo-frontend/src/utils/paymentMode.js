import { useEffect, useState } from 'react';
import api from '../api/api';

// Release F: the marketplace payment mode the server runs (MARKETPLACE_PAYMENT_MODE).
//   'cod_lipa' (default) - the buyer pays the seller directly: by hand on delivery
//                          (same city only) or to the seller's Lipa Namba.
//   'online'             - the old process (online payment, COD with deposit).
// Anything unknown or unreachable counts as 'cod_lipa', so the old online-payment
// screens are never shown by mistake.
let cached = null;
let pending = null;

export const DIRECT_PAYMENT_MODE = 'cod_lipa';

export function normalizePaymentMode(value) {
  return value === 'online' ? 'online' : DIRECT_PAYMENT_MODE;
}

export function fetchPaymentMode() {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = api.get('/orders/payment-mode')
      .then((r) => { cached = normalizePaymentMode(r?.data?.mode); return cached; })
      .catch(() => DIRECT_PAYMENT_MODE)
      .finally(() => { pending = null; });
  }
  return pending;
}

/** null while loading, then 'cod_lipa' | 'online'. */
export function usePaymentMode() {
  const [mode, setMode] = useState(cached);
  useEffect(() => {
    let alive = true;
    fetchPaymentMode().then((m) => { if (alive) setMode(m); });
    return () => { alive = false; };
  }, []);
  return mode;
}

/** An order the buyer pays to the seller directly (KenteXa holds nothing). */
export const isDirectPaymentOrder = (order) => order?.paymentMode === DIRECT_PAYMENT_MODE;

/** Test helper: forget the cached mode. */
export function resetPaymentModeCache() { cached = null; pending = null; }
