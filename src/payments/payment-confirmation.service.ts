import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { PaymentStatus } from './entities/payment.entity';
import {
  OrderStatus,
  EscrowStatus,
  OrderPaymentMethod,
  PaymentStatus as OrderPaymentStatus,
} from '../orders/entities/order.entity';
import { InvoiceStatus } from '../invoices/entities/invoice.entity';
import { ClassifiedInvoiceStatus } from '../classifieds/entities/classified-invoice-request.entity';
import { ProviderVerification } from './providers/payment-provider.interface';
import { parseAmountToMinor, minorEquals, isSupportedCurrency } from './payment-money';
import { computeEvidenceSeal } from './payment-evidence';

/** TypeORM's SELECT ... FOR UPDATE cannot be combined with a LEFT JOIN to a nullable relation
 * (Postgres itself rejects it: "FOR UPDATE cannot be applied to the nullable side of an outer
 * join") — every lock in this service is therefore a plain, join-free row lock; anything else
 * needed (payment.orderId, order.product) is read as a second, unlocked, read-only lookup. */
interface LockedPaymentRow {
  id: number;
  amount: string;
  provider: string;
  status: string;
  providerRequestId: string | null;
  providerReference: string | null;
  metadata: string | null;
  orderId: number | null;
}

export type ConfirmationOutcome =
  | { status: 'PAYMENT_NOT_FOUND'; paymentId: number }
  | { status: 'ALREADY_CONFIRMED'; paymentId: number }
  | { status: 'PROVIDER_NOT_SUCCESS'; paymentId: number; providerStatus: string }
  | { status: 'AMOUNT_MISMATCH'; paymentId: number }
  | { status: 'CURRENCY_MISMATCH'; paymentId: number }
  | { status: 'REFERENCE_REUSED'; paymentId: number }
  | {
      status: 'CONFIRMED';
      paymentId: number;
      orderId: number | null;
      classifiedInvoiceNumber: string | null;
      orderTransition: 'NONE' | 'DIGITAL_COMPLETED' | 'ORDER_PAID' | 'COD_DEPOSIT_CONFIRMED' | 'INELIGIBLE';
      classifiedTransitioned: boolean;
    };

/**
 * S0 Decision 4 — THE canonical payment-confirmation writer. Every source
 * of "a payment happened" (real provider webhook, an explicit admin
 * re-verify, an admin_manual confirmation, the dev-only mock convenience)
 * converges here and nowhere else marks a Payment SUCCESS or transitions an
 * Order/Invoice/ClassifiedInvoiceRequest off PENDING/AWAITING_PAYMENT.
 *
 * Decision 3 — the caller has already gone and asked the provider (or, for
 * admin_manual, has itself constituted the authorized fact) BEFORE calling
 * this; `verification` is meant to already be authoritative. This service's
 * own job is: re-derive the expected amount from OUR OWN stored Payment row
 * (never trust the caller's amount either), compare, and only then commit —
 * atomically, with the order/invoice transition in the SAME transaction as
 * the Payment's own success flip, so a crash between the two is impossible.
 *
 * Idempotency: an already-SUCCESS Payment or an Order no longer in
 * PENDING_PAYMENT is a no-op, not an error — see Decision 10 (historical
 * contradictions fail closed: they are reported, never "repaired").
 */
@Injectable()
export class PaymentConfirmationService {
  private readonly logger = new Logger(PaymentConfirmationService.name);

  constructor(private dataSource: DataSource) {}

  async confirmVerifiedPayment(paymentId: number, verification: ProviderVerification): Promise<ConfirmationOutcome> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const rows: LockedPaymentRow[] = await manager.query(
        `SELECT id, amount, provider, status, "providerRequestId", "providerReference", metadata, "orderId"
           FROM payment WHERE id = $1 FOR UPDATE`,
        [paymentId],
      );
      const payment = rows[0];
      if (!payment) return { status: 'PAYMENT_NOT_FOUND' as const, paymentId };

      if (payment.status === PaymentStatus.SUCCESS) {
        return { status: 'ALREADY_CONFIRMED' as const, paymentId };
      }

      const fail = async (reason: string) => {
        await manager.query(`UPDATE payment SET status = $2, "failureReason" = $3 WHERE id = $1`, [paymentId, PaymentStatus.FAILED, reason]);
      };

      if (verification.status !== 'SUCCESS') {
        await fail(`Provider status: ${verification.status}`);
        return { status: 'PROVIDER_NOT_SUCCESS' as const, paymentId, providerStatus: verification.status };
      }

      // The amount we EXPECT is our own already-stored Payment.amount (set at
      // initiation from the server-derived obligation) — never the caller's.
      const expectedMinor = parseAmountToMinor(payment.amount);
      if (!minorEquals(expectedMinor, verification.amountMinor)) {
        await fail('AMOUNT_MISMATCH');
        this.logger.warn(`Payment #${paymentId} AMOUNT_MISMATCH: expected ${expectedMinor}, provider reported ${verification.amountMinor}`);
        return { status: 'AMOUNT_MISMATCH' as const, paymentId };
      }

      if (verification.currency !== null && !isSupportedCurrency(verification.currency)) {
        await fail('CURRENCY_MISMATCH');
        return { status: 'CURRENCY_MISMATCH' as const, paymentId };
      }

      const providerReference = verification.providerReference || payment.providerReference || `${payment.provider}-${payment.id}`;

      // A provider reference already used by a DIFFERENT successful Payment is never legitimate evidence twice.
      if (verification.providerReference) {
        const dupes = await manager.query(
          `SELECT id FROM payment WHERE "providerReference" = $1 AND id <> $2 AND status = $3`,
          [verification.providerReference, paymentId, PaymentStatus.SUCCESS],
        );
        if (dupes.length > 0) {
          await fail('REFERENCE_REUSED');
          return { status: 'REFERENCE_REUSED' as const, paymentId };
        }
      }

      let meta: Record<string, any> = {};
      try {
        meta = payment.metadata ? JSON.parse(payment.metadata) : {};
      } catch {
        meta = {};
      }
      const orderId = payment.orderId;
      const purpose: string = meta.purpose || (orderId ? 'ORDER_FULL' : 'CLASSIFIED_INVOICE');
      const invoiceNumber: string | null = meta.invoiceNumber ?? null;

      const seal = computeEvidenceSeal({
        paymentId: payment.id,
        orderId,
        invoiceNumber,
        amountMinor: expectedMinor!,
        currency: 'TZS',
        provider: payment.provider,
        providerReference,
        purpose,
      });

      await manager.query(`UPDATE payment SET status = $2, "providerReference" = $3, metadata = $4 WHERE id = $1`, [
        paymentId,
        PaymentStatus.SUCCESS,
        providerReference,
        JSON.stringify({ ...meta, purpose, currency: 'TZS', amountMinor: expectedMinor, orderId, seal }),
      ]);

      let orderTransition: 'NONE' | 'DIGITAL_COMPLETED' | 'ORDER_PAID' | 'COD_DEPOSIT_CONFIRMED' | 'INELIGIBLE' = 'NONE';
      let classifiedTransitioned = false;
      let classifiedInvoiceNumber: string | null = null;

      if (orderId) {
        orderTransition = await this.applyOrderTransitionIn(manager, orderId, providerReference, payment.provider);
      } else if ((meta.invoiceType === 'classified' || meta.invoiceType === 'manual') && invoiceNumber) {
        classifiedInvoiceNumber = invoiceNumber;
        classifiedTransitioned = await this.applyClassifiedInvoiceTransitionIn(manager, invoiceNumber, providerReference, payment.provider);
      }

      return {
        status: 'CONFIRMED' as const,
        paymentId,
        orderId,
        classifiedInvoiceNumber,
        orderTransition,
        classifiedTransitioned,
      };
    });

    return outcome;
  }

  /**
   * The ONE legal transition: PENDING_PAYMENT -> paid (online) / preparing
   * (COD deposit satisfied) / completed (digital). Anything else — already
   * paid/preparing/completed, or cancelled/expired/refunded/disputed/
   * delivered/in_transit — is INELIGIBLE and is left untouched (Decision
   * 10/11): the payment itself is still recorded SUCCESS (money genuinely
   * arrived), but no commercial state is rewritten. This is also what makes
   * retries idempotent: a second confirmation of the same order finds it no
   * longer PENDING_PAYMENT and returns INELIGIBLE without side effects.
   */
  private async applyOrderTransitionIn(
    manager: EntityManager,
    orderId: number,
    providerReference: string,
    provider: string,
  ): Promise<'DIGITAL_COMPLETED' | 'ORDER_PAID' | 'COD_DEPOSIT_CONFIRMED' | 'INELIGIBLE'> {
    const rows = await manager.query(
      `SELECT id, status, "paymentMethod", "productId" FROM "order" WHERE id = $1 FOR UPDATE`,
      [orderId],
    );
    const order = rows[0];
    if (!order || order.status !== OrderStatus.PENDING_PAYMENT) {
      return 'INELIGIBLE';
    }

    let isDigital = false;
    if (order.productId) {
      const productRows = await manager.query(`SELECT "productType" FROM product WHERE id = $1`, [order.productId]);
      isDigital = productRows[0]?.productType === 'digital';
    }
    const isCod = order.paymentMethod === OrderPaymentMethod.COD;
    const now = new Date();

    if (isDigital) {
      await manager.query(
        `UPDATE "order" SET "paymentStatus" = $2, status = $3, "deliveredAt" = $4, "completedAt" = $4,
           "payoutStatus" = 'released', "escrowStatus" = $5, "fundsReleasedAt" = $4 WHERE id = $1`,
        [orderId, OrderPaymentStatus.PAID, OrderStatus.COMPLETED, now, EscrowStatus.RELEASED],
      );
    } else {
      await manager.query(`UPDATE "order" SET "paymentStatus" = $2, status = $3 WHERE id = $1`, [
        orderId,
        isCod ? OrderPaymentStatus.UPFRONT_PAID : OrderPaymentStatus.PAID,
        isCod ? OrderStatus.PREPARING : OrderStatus.PAID,
      ]);
    }

    const invoiceRows = await manager.query(`SELECT id, status FROM invoice WHERE "orderId" = $1`, [orderId]);
    const invoice = invoiceRows[0];
    if (invoice && invoice.status !== InvoiceStatus.PAID) {
      await manager.query(
        `UPDATE invoice SET status = $2, "paidAt" = $3, "transactionReference" = $4, "paymentMethod" = $5 WHERE id = $1`,
        [invoice.id, InvoiceStatus.PAID, now, providerReference, provider],
      );
    }

    return isDigital ? 'DIGITAL_COMPLETED' : isCod ? 'COD_DEPOSIT_CONFIRMED' : 'ORDER_PAID';
  }

  private async applyClassifiedInvoiceTransitionIn(
    manager: EntityManager,
    invoiceNumber: string,
    providerReference: string,
    provider: string,
  ): Promise<boolean> {
    const rows = await manager.query(
      `SELECT id, status FROM classified_invoice_request WHERE "invoiceNumber" = $1 FOR UPDATE`,
      [invoiceNumber],
    );
    const invoice = rows[0];
    if (!invoice || invoice.status === ClassifiedInvoiceStatus.PAID) return false;
    await manager.query(
      `UPDATE classified_invoice_request SET status = $2, "paidAt" = $3, "transactionReference" = $4, "paymentMethod" = $5 WHERE id = $1`,
      [invoice.id, ClassifiedInvoiceStatus.PAID, new Date(), providerReference, provider],
    );
    return true;
  }
}
