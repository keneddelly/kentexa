/**
 * POS part 2 (owner approved 2026-11-03): the pure arithmetic of the day and the drawer.
 * Only recorded amounts; nothing is guessed.
 */
export interface SaleRow {
  total: number | string;
  paymentMethod: string;
  amountPaid: number | string;
  changeDue: number | string;
  balanceDue: number | string;
  payments: Array<{ method: string; amount: number }> | null;
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v: number) => Math.round(v * 100) / 100;

/** What each payment method brought in for one sale (cash net of change); the unpaid part is "deni". */
export function saleByMethod(s: SaleRow): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (m: string, a: number) => { if (a > 0) out[m] = r2((out[m] || 0) + a); };
  if (Array.isArray(s.payments) && s.payments.length) {
    for (const p of s.payments) add(p.method, n(p.amount));
  } else {
    add(s.paymentMethod || 'cash', n(s.amountPaid));
  }
  if (out.cash) out.cash = r2(Math.max(0, out.cash - n(s.changeDue)));
  if (!out.cash) delete out.cash;
  add('deni', n(s.balanceDue));
  return out;
}

/** Cash that went into the drawer for one sale. */
export const saleCash = (s: SaleRow) => saleByMethod(s).cash || 0;

export function sumByMethod(sales: SaleRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sales) for (const [m, a] of Object.entries(saleByMethod(s))) out[m] = r2((out[m] || 0) + a);
  return out;
}

/** The drawer at closing: start + cash sales + debts paid in cash - cash expenses; counted - expected. */
export function drawer(openingFloat: number, cashSales: number, cashDebtPayments: number, cashExpenses: number, counted?: number | null) {
  const expected = r2(n(openingFloat) + n(cashSales) + n(cashDebtPayments) - n(cashExpenses));
  const difference = counted == null ? null : r2(n(counted) - expected);
  return { expected, difference };
}

export const POS_DAY_TEXT = {
  notReady: 'Zamu na matumizi bado havijawashwa.',
  badAmount: 'Andika kiasi sahihi.',
  badReason: 'Andika matumizi ni ya nini (angalau herufi 3).',
  alreadyOpen: 'Una zamu iliyo wazi tayari.',
  noShift: 'Huna zamu iliyo wazi.',
} as const;
