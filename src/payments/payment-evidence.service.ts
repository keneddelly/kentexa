import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { isCheckoutOrderSource } from './checkout-eligibility';
import { isDirectPaymentOrder } from '../orders/direct-payment';
import { deriveOrderPaymentObligation, PaymentPurpose } from './order-payment-obligation';
import { EvidenceCandidateRow, sumValidEvidence } from './payment-evidence';

export interface OrderEvidenceCheckInput {
  id: number;
  source: string;
  paymentMethod: string;
  totalAmount: number | string;
  codUpfrontAmount: number | string | null;
  /** 'cod_lipa' = the buyer pays the seller directly (Release F); KenteXa takes no payment. */
  paymentMode?: string | null;
}

export interface OrderEvidenceResult {
  /** false only ever means "do not proceed" — a non-checkout order is `applicable:false, sufficient:true` (opt-out, not a pass). */
  applicable: boolean;
  sufficient: boolean;
  purpose: PaymentPurpose | null;
  requiredMinor: number;
  totalMinor: number;
  reason?: string;
}

/**
 * S0 defence-in-depth chokepoint: "does this checkout Order have verifiable
 * proof of the payment it needs, right now, independent of its own mutable
 * paymentStatus column?" Used by every fulfilment/logistics/payout guard
 * and by the wallet-credit backstop — one query shape, one answer.
 */
@Injectable()
export class PaymentEvidenceService {
  constructor(@InjectRepository(Payment) private paymentRepo: Repository<Payment>) {}

  async check(order: OrderEvidenceCheckInput): Promise<OrderEvidenceResult> {
    if (!isCheckoutOrderSource(order.source)) {
      return { applicable: false, sufficient: true, purpose: null, requiredMinor: 0, totalMinor: 0 };
    }
    // Release F (cod_lipa): the buyer pays the seller directly, so there is no KenteXa payment to
    // prove. Fulfilment may go ahead (the seller decides when they have been paid). Money can never
    // follow from this: the release step moves nothing for these orders and payouts refuse them.
    if (isDirectPaymentOrder(order)) {
      return { applicable: false, sufficient: true, purpose: null, requiredMinor: 0, totalMinor: 0, reason: 'DIRECT_PAYMENT_NOT_HELD' };
    }

    const obligation = deriveOrderPaymentObligation(order);

    // Decision 9 (S0): zero-upfront COD is NOT auto-authorized just because
    // codUpfrontAmount happens to be 0. The current zero-upfront path is
    // documented as unreachable anyway (CreateOrderDto strips the fields
    // that would select it) — S0 does not carve out a new exception for it.
    if (obligation.purpose === 'COD_DEPOSIT' && obligation.requiredMinor === 0) {
      return {
        applicable: true,
        sufficient: false,
        purpose: obligation.purpose,
        requiredMinor: 0,
        totalMinor: 0,
        reason: 'ZERO_UPFRONT_COD_FAILS_CLOSED_IN_S0',
      };
    }

    // C3 correction: the canonical invoice for this order is looked up and passed into the
    // predicate so it can actually enforce exact invoice binding (previously this call site never
    // supplied one at all, so isValidEvidenceRow's invoice check was a silent no-op).
    const invoiceRows = await this.paymentRepo.query(`SELECT "invoiceNumber" FROM invoice WHERE "orderId" = $1`, [order.id]);
    const invoiceNumber: string | null = invoiceRows[0]?.invoiceNumber ?? null;

    const rows = await this.paymentRepo.query(
      `SELECT id, status, provider, "orderId", "providerReference", metadata FROM payment WHERE "orderId" = $1`,
      [order.id],
    );
    const candidates: EvidenceCandidateRow[] = rows.map((r: any) => ({
      id: r.id,
      status: r.status,
      provider: r.provider,
      orderId: r.orderId,
      providerReference: r.providerReference,
      metadata: r.metadata,
    }));
    const { totalMinor } = sumValidEvidence(candidates, { orderId: order.id, purpose: obligation.purpose, invoiceNumber });
    return {
      applicable: true,
      sufficient: totalMinor >= obligation.requiredMinor,
      purpose: obligation.purpose,
      requiredMinor: obligation.requiredMinor,
      totalMinor,
    };
  }
}
