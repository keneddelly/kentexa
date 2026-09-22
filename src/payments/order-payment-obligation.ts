import { OrderPaymentMethod } from '../orders/entities/order.entity';
import { parseAmountToMinor } from './payment-money';

/**
 * S0 — the server-derived payment obligation for an Order. This is what a
 * buyer must pay through the gateway right now; it is NEVER read from the
 * frontend. Computed the same way at initiation time (how much to ask the
 * provider to collect) and at evidence-check time (how much must be proven
 * paid before the order becomes actionable) — one definition, two callers.
 */
export type PaymentPurpose = 'ORDER_FULL' | 'COD_DEPOSIT';

export interface OrderPaymentObligation {
  purpose: PaymentPurpose;
  /** Amount that must be verifiably paid through the gateway, in integer minor units. */
  requiredMinor: number;
}

export interface ObligationInput {
  paymentMethod: OrderPaymentMethod | string;
  totalAmount: number | string;
  /**
   * null/undefined => not a COD order (paymentMethod decides). 0 => a
   * zero-upfront COD order — S0 deliberately does NOT treat that as "nothing
   * to verify" (see deriveOrderPaymentObligation's own comment); the caller
   * decides what to do with a zero requirement.
   */
  codUpfrontAmount: number | string | null | undefined;
}

/**
 * For COD, the obligation is ALWAYS the upfront deposit — never the full
 * total (the remaining balance is collected physically at delivery, outside
 * the gateway) and never zero just because codUpfrontAmount happens to be 0
 * (S0 fails that case closed at the caller — see cod-eligibility.ts).
 */
export function deriveOrderPaymentObligation(order: ObligationInput): OrderPaymentObligation {
  if (order.paymentMethod === OrderPaymentMethod.COD || order.paymentMethod === 'cod') {
    const upfrontMinor = parseAmountToMinor(order.codUpfrontAmount ?? 0) ?? 0;
    return { purpose: 'COD_DEPOSIT', requiredMinor: Math.max(0, upfrontMinor) };
  }
  const totalMinor = parseAmountToMinor(order.totalAmount) ?? 0;
  return { purpose: 'ORDER_FULL', requiredMinor: Math.max(0, totalMinor) };
}
