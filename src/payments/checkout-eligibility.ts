import { OrderSource } from '../orders/entities/order.entity';

/**
 * S0 scope boundary: which orders are subject to the PaymentEvidence gate.
 *
 * ONLINE checkout orders are the ones the audit found being created BEFORE
 * payment (OrdersService.create -> PENDING_PAYMENT) — that is the exact
 * "unpaid order looks legitimate" shape this hotfix closes.
 *
 * CLASSIFIED_INVOICE orders are deliberately EXCLUDED here: that Order row
 * is only ever created by ClassifiedsService.setShippingMethod(), which
 * itself refuses unless the ClassifiedInvoiceRequest is already PAID (see
 * that method's own guard) — the Order is born already paid. Its trust
 * boundary is the classified invoice's own PAID transition, which S0
 * closes at the source (PaymentConfirmationService / handleCallback), not
 * here a second time.
 *
 * Every other source (offline, offline_intercity, seller_shipment) is a
 * manual/self-reported commerce flow that never held Kentexa escrow in the
 * first place (ZERO FEE RULE) and is explicitly out of scope.
 */
export function isCheckoutOrderSource(source: string | OrderSource | null | undefined): boolean {
  return source === OrderSource.ONLINE || source === 'online';
}
