import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { PaymentStatus } from './entities/payment.entity';
import {
  OrderStatus,
  OrderPaymentMethod,
  PaymentStatus as OrderPaymentStatus,
} from '../orders/entities/order.entity';
import { InvoiceStatus } from '../invoices/entities/invoice.entity';
import { ClassifiedInvoiceStatus } from '../classifieds/entities/classified-invoice-request.entity';
import { ProviderVerification } from './providers/payment-provider.interface';
import { parseAmountToMinor, minorEquals, isSupportedCurrency } from './payment-money';
import { computeEvidenceSeal } from './payment-evidence';
import { deriveOrderPaymentObligation } from './order-payment-obligation';

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

interface LockedOrderRow {
  id: number;
  status: string;
  paymentMethod: string;
  totalAmount: string;
  codUpfrontAmount: string | null;
  productId: number | null;
}

/** Terminal outcomes that mean "this Payment could never be legitimate evidence" — the row is marked FAILED. */
type TerminalFailureStatus =
  | 'PROVIDER_NOT_SUCCESS'
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'REFERENCE_REUSED'
  | 'MISSING_PROVIDER_REFERENCE'
  | 'OBLIGATION_MISMATCH'
  | 'PURPOSE_MISMATCH'
  | 'OBLIGATION_UNRESOLVABLE'
  | 'INVOICE_NOT_PAYABLE';

export type ConfirmationOutcome =
  | { status: 'PAYMENT_NOT_FOUND'; paymentId: number }
  | { status: 'ALREADY_CONFIRMED'; paymentId: number }
  /** C10 — entry-state eligibility: the Payment was not PENDING (e.g. already FAILED) when this
   * was called. A terminal/non-pending Payment must never be resurrected by a later verification,
   * however convincing — nothing is mutated. */
  | { status: 'PAYMENT_NOT_PENDING'; paymentId: number; currentStatus: string }
  /** Provider says not-yet-settled (PENDING/PROCESSING/UNKNOWN/NOT_SUPPORTED) — NOT a failure. The
   * Payment row is left exactly as it was and remains eligible for a later re-verification. */
  | { status: 'NOT_YET_SETTLED'; paymentId: number; providerStatus: string }
  | { status: TerminalFailureStatus; paymentId: number; providerStatus?: string }
  | {
      status: 'CONFIRMED';
      paymentId: number;
      orderId: number | null;
      classifiedInvoiceNumber: string | null;
      orderTransition: 'NONE' | 'DIGITAL_COMPLETED' | 'ORDER_PAID' | 'COD_DEPOSIT_CONFIRMED' | 'INELIGIBLE';
      classifiedTransitioned: boolean;
    };

/** C11 — the only ClassifiedInvoiceRequest statuses a payment may ever transition FROM. PAID is
 * handled separately (idempotent no-op, not a transition). Anything else — CANCELLED today, or any
 * future non-payable terminal status such as an EXPIRED this schema doesn't yet have — fails closed
 * rather than being revived by a late-arriving provider callback. */
const CLASSIFIED_INVOICE_PAYABLE_STATUSES = new Set<string>([ClassifiedInvoiceStatus.PENDING, ClassifiedInvoiceStatus.SENT]);

/**
 * S0 Decision 4 — THE canonical payment-confirmation writer. Every source
 * of "a payment happened" (real provider webhook, an explicit admin
 * re-verify, an admin_manual confirmation, the dev-only mock convenience)
 * converges here and nowhere else marks a Payment SUCCESS or transitions an
 * Order/Invoice/ClassifiedInvoiceRequest off its pending state.
 *
 * Decision 3 — the caller has already gone and asked the provider (or, for
 * admin_manual, has itself constituted the authorized fact) BEFORE calling
 * this; `verification` is meant to already be authoritative. This service's
 * own job (post-review correction, C2/C3/C5) is to trust NEITHER the
 * caller's amount NOR the Payment's own stored metadata blindly:
 *
 *   provider-verified amount  ==  Payment.amount  ==  CURRENT server-owned
 *   Order/Invoice obligation, recomputed fresh, under the SAME row lock
 *   used for the commit.
 *
 * A stale or wrongly-created Payment.amount can therefore never become
 * sealed evidence just because it happens to match what the provider says —
 * the current obligation is re-derived every time, not assumed.
 *
 * Idempotency: an already-SUCCESS Payment or an Order no longer in
 * PENDING_PAYMENT is a no-op, not an error — see Decision 10 (historical
 * contradictions fail closed: they are reported, never "repaired").
 *
 * Retry-safety limitation (C7, documented rather than silently claimed):
 * the financial commit (this transaction) is fully idempotent and
 * exactly-once. The NOTIFICATION side effects dispatched afterwards
 * (payments.service.ts's dispatchConfirmationSideEffects) are best-effort
 * and are NOT redelivered on a provider retry, because a retry that lands
 * on ALREADY_CONFIRMED never re-enters the side-effect dispatch path. Each
 * notification step already logs its own failure independently, so a stuck
 * notification is visible in logs, but it is not automatically retried.
 * Building real redelivery (an outbox) is explicitly deferred to S1/S2 —
 * see Decision 14. Callers must not describe side effects as retry-safe.
 */
@Injectable()
export class PaymentConfirmationService {
  private readonly logger = new Logger(PaymentConfirmationService.name);

  constructor(private dataSource: DataSource) {}

  async confirmVerifiedPayment(paymentId: number, verification: ProviderVerification): Promise<ConfirmationOutcome> {
    return this.dataSource.transaction(async (manager) => {
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
      // C10 — explicit entry-state eligibility: canonical confirmation may only ever OPERATE on a
      // currently PENDING payment (SUCCESS already short-circuited above as idempotent). A Payment
      // already FAILED (amount mismatch, purpose mismatch, reused reference, initiation failure,
      // a prior terminal provider FAILED, ...) must never be resurrected by a later verification
      // that happens to look valid — nothing below this point may run for it.
      if (payment.status !== PaymentStatus.PENDING) {
        return { status: 'PAYMENT_NOT_PENDING' as const, paymentId, currentStatus: payment.status };
      }

      const fail = async (reason: TerminalFailureStatus | string) => {
        await manager.query(`UPDATE payment SET status = $2, "failureReason" = $3 WHERE id = $1`, [paymentId, PaymentStatus.FAILED, reason]);
      };

      // C6 — PENDING/PROCESSING/UNKNOWN/NOT_SUPPORTED is "not settled yet", never a terminal
      // failure. Only a provider's own documented terminal FAILED marks this Payment FAILED; every
      // other non-SUCCESS status leaves the row exactly as it was, still PENDING and re-verifiable.
      if (verification.status === 'FAILED') {
        await fail('PROVIDER_NOT_SUCCESS');
        return { status: 'PROVIDER_NOT_SUCCESS' as const, paymentId, providerStatus: 'FAILED' };
      }
      if (verification.status !== 'SUCCESS') {
        return { status: 'NOT_YET_SETTLED' as const, paymentId, providerStatus: verification.status };
      }

      let meta: Record<string, any> = {};
      try {
        meta = payment.metadata ? JSON.parse(payment.metadata) : {};
      } catch {
        meta = {};
      }
      const orderId = payment.orderId;
      const storedMinor = parseAmountToMinor(payment.amount);

      // C2/C3 — re-derive the CURRENT server-owned obligation and invoice binding under lock. The
      // Payment's own stored metadata.purpose/invoiceNumber is never trusted as the source of
      // truth by itself; it is only ever compared against what is re-computed here, right now.
      let canonicalPurpose: string;
      let canonicalRequiredMinor: number;
      let canonicalInvoiceNumber: string | null = null;
      let lockedOrder: LockedOrderRow | null = null;

      if (orderId) {
        const orderRows: LockedOrderRow[] = await manager.query(
          `SELECT id, status, "paymentMethod", "totalAmount", "codUpfrontAmount", "productId" FROM "order" WHERE id = $1 FOR UPDATE`,
          [orderId],
        );
        lockedOrder = orderRows[0] ?? null;
        if (!lockedOrder) {
          await fail('OBLIGATION_UNRESOLVABLE');
          return { status: 'OBLIGATION_UNRESOLVABLE' as const, paymentId };
        }
        const obligation = deriveOrderPaymentObligation({
          paymentMethod: lockedOrder.paymentMethod,
          totalAmount: lockedOrder.totalAmount,
          codUpfrontAmount: lockedOrder.codUpfrontAmount,
        });
        canonicalPurpose = obligation.purpose;
        canonicalRequiredMinor = obligation.requiredMinor;
        const invRows = await manager.query(`SELECT "invoiceNumber" FROM invoice WHERE "orderId" = $1`, [orderId]);
        canonicalInvoiceNumber = invRows[0]?.invoiceNumber ?? null;
      } else if ((meta.invoiceType === 'classified' || meta.invoiceType === 'manual') && meta.invoiceNumber) {
        const invRows = await manager.query(
          `SELECT id, status, amount, "isCod", "codUpfrontAmount" FROM classified_invoice_request WHERE "invoiceNumber" = $1 FOR UPDATE`,
          [meta.invoiceNumber],
        );
        const inv = invRows[0];
        if (!inv) {
          await fail('OBLIGATION_UNRESOLVABLE');
          return { status: 'OBLIGATION_UNRESOLVABLE' as const, paymentId };
        }
        // C11 — an ALLOW-list, not a deny-list: PAID is handled as an idempotent no-op below;
        // anything else must be a currently payable/in-flight status (PENDING/SENT) or this
        // late-arriving verification is fail-closed rather than reviving a CANCELLED (or any
        // future non-payable terminal status this schema doesn't have yet, e.g. an EXPIRED) invoice.
        if (inv.status !== ClassifiedInvoiceStatus.PAID && !CLASSIFIED_INVOICE_PAYABLE_STATUSES.has(inv.status)) {
          await fail('INVOICE_NOT_PAYABLE');
          this.logger.warn(`Payment #${paymentId} INVOICE_NOT_PAYABLE: classified_invoice_request ${meta.invoiceNumber} is ${inv.status}`);
          return { status: 'INVOICE_NOT_PAYABLE' as const, paymentId };
        }
        canonicalPurpose = 'CLASSIFIED_INVOICE';
        canonicalRequiredMinor = parseAmountToMinor(inv.isCod ? inv.codUpfrontAmount : inv.amount) ?? -1;
        canonicalInvoiceNumber = meta.invoiceNumber;
      } else {
        // Neither an Order nor a recognised invoice-type binding — there is nothing authoritative
        // to re-derive an obligation from. Fail closed rather than seal an unresolvable payment.
        await fail('OBLIGATION_UNRESOLVABLE');
        return { status: 'OBLIGATION_UNRESOLVABLE' as const, paymentId };
      }

      if (meta.purpose && meta.purpose !== canonicalPurpose) {
        await fail('PURPOSE_MISMATCH');
        this.logger.warn(`Payment #${paymentId} PURPOSE_MISMATCH: stored purpose=${meta.purpose}, current obligation=${canonicalPurpose}`);
        return { status: 'PURPOSE_MISMATCH' as const, paymentId };
      }
      if (!minorEquals(storedMinor, canonicalRequiredMinor)) {
        await fail('OBLIGATION_MISMATCH');
        this.logger.warn(`Payment #${paymentId} OBLIGATION_MISMATCH: Payment.amount=${storedMinor}, current obligation=${canonicalRequiredMinor}`);
        return { status: 'OBLIGATION_MISMATCH' as const, paymentId };
      }

      // Only NOW compare the provider's verified amount — against the SAME storedMinor already
      // proven to equal the current obligation, so this is really a 3-way equality end to end.
      if (!minorEquals(storedMinor, verification.amountMinor)) {
        await fail('AMOUNT_MISMATCH');
        this.logger.warn(`Payment #${paymentId} AMOUNT_MISMATCH: expected ${storedMinor}, provider reported ${verification.amountMinor}`);
        return { status: 'AMOUNT_MISMATCH' as const, paymentId };
      }

      // C8 — a missing currency is not "unknown, assume TZS", it is a fail-closed case. Real
      // financial confirmation requires POSITIVELY verified TZS, not merely "not something else".
      if (!isSupportedCurrency(verification.currency)) {
        await fail('CURRENCY_MISMATCH');
        return { status: 'CURRENCY_MISMATCH' as const, paymentId };
      }

      // C9 — a genuine provider SUCCESS must carry the provider's OWN verified transaction
      // reference from THIS verification call. A value merely stored on the row from an earlier
      // attempt is not proof the provider verified this one — it is never substituted here.
      // admin_manual/mock always construct an explicit verification.providerReference themselves
      // (the admin's own receipt reference / the dev mock's own synthetic one), so this never
      // affects them; it only closes the real-provider gap where verifyPayment() reports SUCCESS
      // with no identity at all.
      const providerReference = verification.providerReference || null;
      if (!providerReference) {
        await fail('MISSING_PROVIDER_REFERENCE');
        return { status: 'MISSING_PROVIDER_REFERENCE' as const, paymentId };
      }

      // A provider reference already used by a DIFFERENT successful Payment is never legitimate evidence twice.
      const dupes = await manager.query(
        `SELECT id FROM payment WHERE "providerReference" = $1 AND id <> $2 AND status = $3`,
        [providerReference, paymentId, PaymentStatus.SUCCESS],
      );
      if (dupes.length > 0) {
        await fail('REFERENCE_REUSED');
        return { status: 'REFERENCE_REUSED' as const, paymentId };
      }

      const seal = computeEvidenceSeal({
        paymentId: payment.id,
        orderId,
        invoiceNumber: canonicalInvoiceNumber,
        amountMinor: storedMinor!,
        currency: 'TZS',
        provider: payment.provider,
        providerReference,
        purpose: canonicalPurpose,
      });

      await manager.query(`UPDATE payment SET status = $2, "providerReference" = $3, metadata = $4 WHERE id = $1`, [
        paymentId,
        PaymentStatus.SUCCESS,
        providerReference,
        JSON.stringify({ ...meta, purpose: canonicalPurpose, currency: 'TZS', amountMinor: storedMinor, orderId, invoiceNumber: canonicalInvoiceNumber, seal }),
      ]);

      let orderTransition: 'NONE' | 'DIGITAL_COMPLETED' | 'ORDER_PAID' | 'COD_DEPOSIT_CONFIRMED' | 'INELIGIBLE' = 'NONE';
      let classifiedTransitioned = false;

      if (orderId && lockedOrder) {
        orderTransition = await this.applyOrderTransitionIn(manager, lockedOrder, providerReference, payment.provider);
      } else if (canonicalInvoiceNumber) {
        classifiedTransitioned = await this.applyClassifiedInvoiceTransitionIn(manager, canonicalInvoiceNumber, providerReference, payment.provider);
      }

      return {
        status: 'CONFIRMED' as const,
        paymentId,
        orderId,
        classifiedInvoiceNumber: orderId ? null : canonicalInvoiceNumber,
        orderTransition,
        classifiedTransitioned,
      };
    });
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
   *
   * `order` is the SAME row already locked (FOR UPDATE) by confirmVerifiedPayment
   * while re-deriving the obligation — reused here rather than re-queried, so
   * there is exactly one lock acquisition and one consistent view of the row
   * for the whole transaction.
   */
  private async applyOrderTransitionIn(
    manager: EntityManager,
    order: LockedOrderRow,
    providerReference: string,
    provider: string,
  ): Promise<'DIGITAL_COMPLETED' | 'ORDER_PAID' | 'COD_DEPOSIT_CONFIRMED' | 'INELIGIBLE'> {
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
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
      // S0 x I2G integration gate: this method's job stops at "was this payment legitimately
      // confirmed" — it deliberately does NOT write paymentStatus/status/escrowStatus/
      // fundsReleasedAt for a digital order. OrderReleaseService is the one and only writer of
      // escrow RELEASED / fundsReleasedAt; the caller (PaymentsService.completeDigitalOrder,
      // triggered by the DIGITAL_COMPLETED classification returned below) performs the actual
      // completion + canonical release immediately after this transaction commits.
    } else {
      await manager.query(`UPDATE "order" SET "paymentStatus" = $2, status = $3 WHERE id = $1`, [
        order.id,
        isCod ? OrderPaymentStatus.UPFRONT_PAID : OrderPaymentStatus.PAID,
        isCod ? OrderStatus.PREPARING : OrderStatus.PAID,
      ]);
    }

    const invoiceRows = await manager.query(`SELECT id, status FROM invoice WHERE "orderId" = $1`, [order.id]);
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
    // C11 defensive mirror — confirmVerifiedPayment already validated this against the same
    // allow-list under the same lock before sealing, but this transition never runs on anything
    // outside PENDING/SENT even if called independently in the future.
    if (!CLASSIFIED_INVOICE_PAYABLE_STATUSES.has(invoice.status)) return false;
    await manager.query(
      `UPDATE classified_invoice_request SET status = $2, "paidAt" = $3, "transactionReference" = $4, "paymentMethod" = $5 WHERE id = $1`,
      [invoice.id, ClassifiedInvoiceStatus.PAID, new Date(), providerReference, provider],
    );
    return true;
  }
}
