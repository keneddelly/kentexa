import { BadRequestException, ConflictException } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoiceStatus } from './entities/invoice.entity';
import { PaymentStatus as GatewayPaymentStatus } from '../payments/entities/payment.entity';

/**
 * S0 — admin_manual mark-paid is not a second financial authority: it must
 * create a real, auditable Payment and go through the SAME canonical
 * confirmation as every provider webhook. See InvoicesService.markPaid's
 * own comment and payment-confirmation.service.ts.
 */
describe('InvoicesService.markPaid — admin_manual confirmation', () => {
  let service: InvoicesService;
  let invoiceRepo: any;
  let paymentRepo: any;
  let orderRepo: any;
  let paymentConfirmation: any;
  let activityEvents: any;
  let commerceProfiles: any;
  let reputationService: any;

  const invoiceFixture = (over: any = {}) => ({
    id: 1,
    invoiceNumber: 'INV-1',
    status: InvoiceStatus.AWAITING_PAYMENT,
    amount: 198000,
    buyer: { id: 9 },
    order: { id: 42, paymentMethod: 'online', totalAmount: 198000, codUpfrontAmount: null, seller: { id: 5 } },
    ...over,
  });

  beforeEach(() => {
    invoiceRepo = { findOne: jest.fn(), update: jest.fn() };
    paymentRepo = { create: jest.fn((x: any) => x), save: jest.fn(async (x: any) => ({ id: 77, ...x })) };
    orderRepo = { findOne: jest.fn() };
    paymentConfirmation = { confirmVerifiedPayment: jest.fn() };
    activityEvents = { record: jest.fn() };
    commerceProfiles = { findForUserByType: jest.fn(async () => null) };
    reputationService = { award: jest.fn(async () => undefined) };

    service = new InvoicesService(
      invoiceRepo, {} as any, {} as any, orderRepo, paymentRepo,
      {} as any, // dataSource
      activityEvents, commerceProfiles, {} as any, reputationService, paymentConfirmation,
    );
    invoiceRepo.findOne.mockResolvedValue(invoiceFixture());
  });

  it('rejects an already-PAID invoice without creating a Payment', async () => {
    invoiceRepo.findOne.mockResolvedValue(invoiceFixture({ status: InvoiceStatus.PAID }));
    await expect(service.markPaid('INV-1', 'REF1', 'confirmed by phone call', 1)).rejects.toThrow(BadRequestException);
    expect(paymentRepo.save).not.toHaveBeenCalled();
  });

  it('requires a transactionReference', async () => {
    await expect(service.markPaid('INV-1', '', 'confirmed by phone call', 1)).rejects.toThrow(BadRequestException);
    expect(paymentRepo.save).not.toHaveBeenCalled();
  });

  it('requires a real reason (at least 5 characters) — this must never become a rubber-stamp path', async () => {
    await expect(service.markPaid('INV-1', 'REF1', 'ok', 1)).rejects.toThrow(BadRequestException);
    expect(paymentRepo.save).not.toHaveBeenCalled();
  });

  it('creates a Payment(provider=admin_manual) bound to the order, carrying the actor and reason, PENDING until confirmed', async () => {
    paymentConfirmation.confirmVerifiedPayment.mockResolvedValue({ status: 'CONFIRMED', paymentId: 77, orderId: 42, orderTransition: 'ORDER_PAID', classifiedInvoiceNumber: null, classifiedTransitioned: false });

    await service.markPaid('INV-1', 'REF1', 'buyer confirmed cash deposit at branch', 3);

    expect(paymentRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { id: 42 },
        amount: 198000,
        provider: 'admin_manual',
        status: GatewayPaymentStatus.PENDING,
      }),
    );
    const meta = JSON.parse(paymentRepo.create.mock.calls[0][0].metadata);
    expect(meta).toMatchObject({ purpose: 'ORDER_FULL', invoiceType: 'order', invoiceNumber: 'INV-1', actorUserId: 3 });
    expect(meta.reason).toContain('buyer confirmed');
  });

  it('never claims admin_manual was provider-verified: the Payment provenance stays admin_manual, never selcom/clickpesa', async () => {
    paymentConfirmation.confirmVerifiedPayment.mockResolvedValue({ status: 'CONFIRMED', paymentId: 77, orderId: 42, orderTransition: 'ORDER_PAID', classifiedInvoiceNumber: null, classifiedTransitioned: false });
    await service.markPaid('INV-1', 'REF1', 'buyer confirmed cash deposit at branch', 3);
    expect(paymentRepo.create.mock.calls[0][0].provider).toBe('admin_manual');
  });

  it('passes the invoice AMOUNT (server-derived) as the verified amount — never trusts a caller-supplied figure', async () => {
    paymentConfirmation.confirmVerifiedPayment.mockResolvedValue({ status: 'CONFIRMED', paymentId: 77, orderId: 42, orderTransition: 'ORDER_PAID', classifiedInvoiceNumber: null, classifiedTransitioned: false });
    await service.markPaid('INV-1', 'REF1', 'buyer confirmed cash deposit at branch', 3);
    expect(paymentConfirmation.confirmVerifiedPayment).toHaveBeenCalledWith(77, { status: 'SUCCESS', amountMinor: 19800000, currency: 'TZS', providerReference: 'REF1' });
  });

  it('for a COD order, derives the obligation as the DEPOSIT, not the full total', async () => {
    invoiceRepo.findOne.mockResolvedValue(invoiceFixture({ amount: 36000, order: { id: 42, paymentMethod: 'cod', totalAmount: 180000, codUpfrontAmount: 36000, seller: { id: 5 } } }));
    paymentConfirmation.confirmVerifiedPayment.mockResolvedValue({ status: 'CONFIRMED', paymentId: 77, orderId: 42, orderTransition: 'COD_DEPOSIT_CONFIRMED', classifiedInvoiceNumber: null, classifiedTransitioned: false });
    await service.markPaid('INV-1', 'REF1', 'seller confirmed deposit received', 3);
    const meta = JSON.parse(paymentRepo.create.mock.calls[0][0].metadata);
    expect(meta.purpose).toBe('COD_DEPOSIT');
  });

  it('surfaces a non-CONFIRMED outcome as a 409 rather than pretending the invoice is paid (Decision 10: fail closed, never silently repair)', async () => {
    paymentConfirmation.confirmVerifiedPayment.mockResolvedValue({ status: 'CONFIRMED', paymentId: 77, orderId: 42, orderTransition: 'INELIGIBLE', classifiedInvoiceNumber: null, classifiedTransitioned: false });
    // NOTE: applyOrderTransitionIn returning INELIGIBLE still reports outcome.status === 'CONFIRMED'
    // at the Payment level (money/authorization genuinely happened) — this test instead exercises a
    // genuinely failed confirmation outcome (e.g. reused reference) to prove markPaid surfaces it.
    paymentConfirmation.confirmVerifiedPayment.mockResolvedValueOnce({ status: 'REFERENCE_REUSED', paymentId: 77 });
    await expect(service.markPaid('INV-1', 'REF1', 'buyer confirmed cash deposit at branch', 3)).rejects.toThrow(ConflictException);
  });

  it('records a PAYMENT_MANUALLY_CONFIRMED activity event carrying the actor and reason — accountability for the admin action itself', async () => {
    paymentConfirmation.confirmVerifiedPayment.mockResolvedValue({ status: 'CONFIRMED', paymentId: 77, orderId: 42, orderTransition: 'ORDER_PAID', classifiedInvoiceNumber: null, classifiedTransitioned: false });
    await service.markPaid('INV-1', 'REF1', 'buyer confirmed cash deposit at branch', 3);
    expect(activityEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'PAYMENT_MANUALLY_CONFIRMED', actorId: 3, actorType: 'admin' }),
    );
  });
});
