import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentStatus } from './entities/payment.entity';
import { OrderStatus } from '../orders/entities/order.entity';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let paymentRepo: any;
  let payoutRepo: any;
  let orderRepo: any;
  let invoiceRepo: any;
  let classifiedInvoiceRepo: any;
  let agentRepo: any;
  let agentTransactionRepo: any;
  let vodacomService: any;
  let airtelService: any;
  let selcomService: any;
  let mockAgentService: any;
  let clickPesaService: any;
  let notificationsService: any;
  let invoicesService: any;
  let activityEvents: any;
  let commerceProfiles: any;
  let walletService: any;
  let reputationService: any;
  let conversationService: any;
  let businessCustomerService: any;
  let communicationEngine: any;
  let paymentConfirmation: any;

  const originalNodeEnv = process.env.NODE_ENV;
  const originalEnabled = process.env.PAYMENTS_ENABLED_PROVIDERS;

  beforeEach(() => {
    const noPendingQB = { where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getOne: jest.fn().mockResolvedValue(null) };
    paymentRepo = {
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x: any) => ({ id: 1, ...x })),
      update: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(() => noPendingQB),
    };
    payoutRepo = { findOne: jest.fn(), save: jest.fn() };
    orderRepo = { findOne: jest.fn(), update: jest.fn(), createQueryBuilder: jest.fn(), count: jest.fn() };
    invoiceRepo = { findOne: jest.fn(), update: jest.fn() };
    classifiedInvoiceRepo = { findOne: jest.fn(), update: jest.fn() };
    agentRepo = { findOne: jest.fn() };
    agentTransactionRepo = { findOne: jest.fn(), save: jest.fn(), create: jest.fn() };
    vodacomService = { name: 'vodacom', initiatePayment: jest.fn(), parseCallbackSignal: jest.fn(), verifyPayment: jest.fn() };
    airtelService = { name: 'airtel', initiatePayment: jest.fn(), parseCallbackSignal: jest.fn(), verifyPayment: jest.fn() };
    selcomService = { name: 'selcom', initiatePayment: jest.fn(), parseCallbackSignal: jest.fn(), verifyPayment: jest.fn() };
    mockAgentService = { name: 'mock', initiatePayment: jest.fn(), parseCallbackSignal: jest.fn(), verifyPayment: jest.fn() };
    clickPesaService = { name: 'clickpesa', initiatePayment: jest.fn(), parseCallbackSignal: jest.fn(), verifyPayment: jest.fn() };
    notificationsService = { orderPaid: jest.fn(), classifiedInvoicePaid: jest.fn(), orderCompleted: jest.fn() };
    invoicesService = { findByOrderId: jest.fn(async () => null), createForOrder: jest.fn() };
    activityEvents = { record: jest.fn() };
    commerceProfiles = { findForUserByType: jest.fn(async () => null) };
    walletService = { creditFromEscrowRelease: jest.fn(async () => undefined) };
    reputationService = { award: jest.fn(async () => undefined) };
    conversationService = {};
    businessCustomerService = { findOrCreateForChat: jest.fn(async () => null) };
    communicationEngine = { dispatch: jest.fn(async () => undefined) };
    paymentConfirmation = { confirmVerifiedPayment: jest.fn() };

    service = new PaymentsService(
      paymentRepo,
      payoutRepo,
      orderRepo,
      invoiceRepo,
      classifiedInvoiceRepo,
      agentRepo,
      agentTransactionRepo,
      vodacomService,
      airtelService,
      selcomService,
      mockAgentService,
      clickPesaService,
      notificationsService,
      invoicesService,
      activityEvents,
      commerceProfiles,
      walletService,
      reputationService,
      conversationService,
      businessCustomerService,
      communicationEngine,
      paymentConfirmation,
    );
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.PAYMENTS_ENABLED_PROVIDERS = originalEnabled;
  });

  describe('getProvider() — implementation vs activation', () => {
    it('outside production always uses mock, regardless of enabled-providers config', () => {
      process.env.NODE_ENV = 'test';
      const provider = (service as any).getProvider('selcom');
      expect(provider).toBe(mockAgentService);
    });

    it('in production, an unconfigured/empty PAYMENTS_ENABLED_PROVIDERS refuses EVERY provider, including selcom/clickpesa', () => {
      process.env.NODE_ENV = 'production';
      process.env.PAYMENTS_ENABLED_PROVIDERS = '';
      expect(() => (service as any).getProvider('selcom')).toThrow(BadRequestException);
      expect(() => (service as any).getProvider('clickpesa')).toThrow(BadRequestException);
      expect(() => (service as any).getProvider('mock')).toThrow(BadRequestException);
    });

    it('in production, an explicitly enabled provider is reachable; others remain refused', () => {
      process.env.NODE_ENV = 'production';
      process.env.PAYMENTS_ENABLED_PROVIDERS = 'clickpesa';
      expect((service as any).getProvider('clickpesa')).toBe(clickPesaService);
      expect(() => (service as any).getProvider('selcom')).toThrow(BadRequestException);
    });

    it('"mock" is never returned in production even when literally requested and even if listed in PAYMENTS_ENABLED_PROVIDERS', () => {
      process.env.NODE_ENV = 'production';
      process.env.PAYMENTS_ENABLED_PROVIDERS = 'mock';
      expect(() => (service as any).getProvider('mock')).toThrow(BadRequestException);
    });
  });

  describe('mockAgentCallback() production guard', () => {
    it('throws ForbiddenException in production', async () => {
      process.env.NODE_ENV = 'production';
      await expect(service.mockAgentCallback('req-1')).rejects.toThrow(ForbiddenException);
    });

    it('outside production, builds verification from OUR OWN stored Payment amount and confirms via the canonical service', async () => {
      process.env.NODE_ENV = 'test';
      paymentRepo.findOne.mockResolvedValue({ id: 9, providerRequestId: 'req-1', amount: 36000, metadata: null });
      paymentConfirmation.confirmVerifiedPayment.mockResolvedValue({ status: 'CONFIRMED', paymentId: 9, orderId: null, classifiedInvoiceNumber: null, orderTransition: 'NONE', classifiedTransitioned: false });

      await service.mockAgentCallback('req-1');

      expect(paymentConfirmation.confirmVerifiedPayment).toHaveBeenCalledWith(
        9,
        expect.objectContaining({ status: 'SUCCESS', amountMinor: 3600000, currency: 'TZS' }),
      );
    });

    it('throws NotFoundException for an unknown providerRequestId', async () => {
      process.env.NODE_ENV = 'test';
      paymentRepo.findOne.mockResolvedValue(null);
      await expect(service.mockAgentCallback('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('handleCallback() — signal only, verification is authoritative', () => {
    it('never trusts the callback body: locates by signal, then calls verifyPayment(), then the canonical confirmation service', async () => {
      process.env.NODE_ENV = 'production';
      process.env.PAYMENTS_ENABLED_PROVIDERS = 'selcom';
      selcomService.parseCallbackSignal.mockReturnValue({ providerRequestId: 'req-2' });
      selcomService.verifyPayment.mockResolvedValue({ status: 'SUCCESS', amountMinor: 100000, currency: 'TZS', providerReference: 'ref-2' });
      paymentRepo.findOne.mockResolvedValue({ id: 5, providerRequestId: 'req-2', status: PaymentStatus.PENDING });
      paymentConfirmation.confirmVerifiedPayment.mockResolvedValue({ status: 'CONFIRMED', paymentId: 5, orderId: null, classifiedInvoiceNumber: null, orderTransition: 'NONE', classifiedTransitioned: false });

      const result = await service.handleCallback({ order_id: 'ignored-by-design' }, 'selcom');

      expect(result).toEqual({ message: 'OK' });
      expect(selcomService.verifyPayment).toHaveBeenCalledWith('req-2');
      expect(paymentConfirmation.confirmVerifiedPayment).toHaveBeenCalledWith(5, expect.objectContaining({ status: 'SUCCESS' }));
    });

    it('no-ops for a payment already SUCCESS, without calling verifyPayment again', async () => {
      process.env.NODE_ENV = 'production';
      process.env.PAYMENTS_ENABLED_PROVIDERS = 'selcom';
      selcomService.parseCallbackSignal.mockReturnValue({ providerRequestId: 'req-1' });
      paymentRepo.findOne.mockResolvedValue({ id: 1, providerRequestId: 'req-1', status: PaymentStatus.SUCCESS });

      const result = await service.handleCallback({}, 'selcom');

      expect(result).toEqual({ message: 'OK' });
      expect(selcomService.verifyPayment).not.toHaveBeenCalled();
      expect(paymentConfirmation.confirmVerifiedPayment).not.toHaveBeenCalled();
    });

    it('a callback for a disabled provider is silently ignored (200 OK), never a 500', async () => {
      process.env.NODE_ENV = 'production';
      process.env.PAYMENTS_ENABLED_PROVIDERS = ''; // nothing enabled
      const result = await service.handleCallback({}, 'selcom');
      expect(result).toEqual({ message: 'OK' });
    });

    it('a callback carrying no identifiable reference is ignored', async () => {
      process.env.NODE_ENV = 'production';
      process.env.PAYMENTS_ENABLED_PROVIDERS = 'selcom';
      selcomService.parseCallbackSignal.mockReturnValue(null);
      const result = await service.handleCallback({}, 'selcom');
      expect(result).toEqual({ message: 'OK' });
      expect(paymentRepo.findOne).not.toHaveBeenCalled();
    });

    it('dispatches order-paid notifications only when the confirmation actually transitioned the order (ORDER_PAID)', async () => {
      process.env.NODE_ENV = 'production';
      process.env.PAYMENTS_ENABLED_PROVIDERS = 'selcom';
      selcomService.parseCallbackSignal.mockReturnValue({ providerRequestId: 'req-3' });
      selcomService.verifyPayment.mockResolvedValue({ status: 'SUCCESS', amountMinor: 198000000, currency: 'TZS', providerReference: 'ref-3' });
      paymentRepo.findOne.mockResolvedValueOnce({ id: 7, providerRequestId: 'req-3', status: PaymentStatus.PENDING });
      paymentConfirmation.confirmVerifiedPayment.mockResolvedValue({ status: 'CONFIRMED', paymentId: 7, orderId: 55, classifiedInvoiceNumber: null, orderTransition: 'ORDER_PAID', classifiedTransitioned: false });
      orderRepo.findOne.mockResolvedValue({ id: 55, status: 'paid', paymentMethod: 'online', buyer: null, seller: null, product: { name: 'Fixture' }, totalAmount: 198000 });

      await service.handleCallback({}, 'selcom');

      expect(notificationsService.orderPaid).toHaveBeenCalled();
    });

    it('an INELIGIBLE transition (order not longer pending_payment — e.g. cancelled) sends no notification', async () => {
      process.env.NODE_ENV = 'production';
      process.env.PAYMENTS_ENABLED_PROVIDERS = 'selcom';
      selcomService.parseCallbackSignal.mockReturnValue({ providerRequestId: 'req-4' });
      selcomService.verifyPayment.mockResolvedValue({ status: 'SUCCESS', amountMinor: 5000000, currency: 'TZS', providerReference: 'ref-4' });
      paymentRepo.findOne.mockResolvedValue({ id: 8, providerRequestId: 'req-4', status: PaymentStatus.PENDING });
      paymentConfirmation.confirmVerifiedPayment.mockResolvedValue({ status: 'CONFIRMED', paymentId: 8, orderId: 60, classifiedInvoiceNumber: null, orderTransition: 'INELIGIBLE', classifiedTransitioned: false });

      await service.handleCallback({}, 'selcom');

      expect(notificationsService.orderPaid).not.toHaveBeenCalled();
      expect(orderRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('handleCallback() classified/manual invoice branch', () => {
    it('sends the classifiedInvoicePaid notification only when the confirmation actually flipped it to PAID', async () => {
      process.env.NODE_ENV = 'production';
      process.env.PAYMENTS_ENABLED_PROVIDERS = 'selcom';
      selcomService.parseCallbackSignal.mockReturnValue({ providerRequestId: 'req-5' });
      selcomService.verifyPayment.mockResolvedValue({ status: 'SUCCESS', amountMinor: 5000000, currency: 'TZS', providerReference: 'ref-5' });
      paymentRepo.findOne.mockResolvedValue({ id: 10, providerRequestId: 'req-5', status: PaymentStatus.PENDING });
      paymentConfirmation.confirmVerifiedPayment.mockResolvedValue({ status: 'CONFIRMED', paymentId: 10, orderId: null, classifiedInvoiceNumber: 'INV-9', orderTransition: 'NONE', classifiedTransitioned: true });
      classifiedInvoiceRepo.findOne.mockResolvedValue({
        invoiceNumber: 'INV-9', amount: 50000, buyerMessage: 'Name: Amina | Phone: 255700000000',
        buyer: { email: 'a@x.com', phone: '255700000000', name: 'Amina' }, seller: { email: 's@x.com', phone: '255711111111', name: 'Seller' },
      });

      await service.handleCallback({}, 'selcom');

      expect(notificationsService.classifiedInvoicePaid).toHaveBeenCalled();
    });

    it('does not notify when classifiedTransitioned is false (idempotent retry)', async () => {
      process.env.NODE_ENV = 'production';
      process.env.PAYMENTS_ENABLED_PROVIDERS = 'selcom';
      selcomService.parseCallbackSignal.mockReturnValue({ providerRequestId: 'req-6' });
      selcomService.verifyPayment.mockResolvedValue({ status: 'SUCCESS', amountMinor: 5000000, currency: 'TZS', providerReference: 'ref-6' });
      paymentRepo.findOne.mockResolvedValue({ id: 11, providerRequestId: 'req-6', status: PaymentStatus.PENDING });
      paymentConfirmation.confirmVerifiedPayment.mockResolvedValue({ status: 'CONFIRMED', paymentId: 11, orderId: null, classifiedInvoiceNumber: 'INV-9', orderTransition: 'NONE', classifiedTransitioned: false });

      await service.handleCallback({}, 'selcom');

      expect(notificationsService.classifiedInvoicePaid).not.toHaveBeenCalled();
    });
  });

  describe('initiatePayment() — server-derived amount and payability', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test'; // mock provider path
    });

    it('rejects an order that is not PENDING_PAYMENT (cancelled/expired/already paid/etc.), not just "already paid"', async () => {
      orderRepo.findOne.mockResolvedValue({ id: 5, status: OrderStatus.CANCELLED, totalAmount: 1000, paymentMethod: 'online' });
      await expect(service.initiatePayment({ orderId: 5, phone: '255700000000', provider: 'selcom' } as any, { id: 1 } as any)).rejects.toThrow(BadRequestException);
      expect(mockAgentService.initiatePayment).not.toHaveBeenCalled();
    });

    it('blocks a new request while one is already pending', async () => {
      orderRepo.findOne.mockResolvedValue({ id: 5, status: OrderStatus.PENDING_PAYMENT, totalAmount: 1000, paymentMethod: 'online' });
      paymentRepo.findOne.mockResolvedValue({ id: 1, status: PaymentStatus.PENDING });
      await expect(service.initiatePayment({ orderId: 5, phone: '255700000000', provider: 'selcom' } as any, { id: 1 } as any)).rejects.toThrow(BadRequestException);
      expect(mockAgentService.initiatePayment).not.toHaveBeenCalled();
    });

    it('charges the FULL total for an ONLINE order', async () => {
      orderRepo.findOne.mockResolvedValue({ id: 5, status: OrderStatus.PENDING_PAYMENT, totalAmount: 198000, paymentMethod: 'online', codUpfrontAmount: null });
      paymentRepo.findOne.mockResolvedValue(null);
      mockAgentService.initiatePayment.mockResolvedValue({ success: true, providerRequestId: 'req', message: 'ok' });

      await service.initiatePayment({ orderId: 5, phone: '255700000000', provider: 'selcom' } as any, { id: 1 } as any);

      expect(mockAgentService.initiatePayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 198000 }));
    });

    it('charges ONLY the COD deposit, never the full total (TZS 36,000 not TZS 198,000)', async () => {
      orderRepo.findOne.mockResolvedValue({ id: 5, status: OrderStatus.PENDING_PAYMENT, totalAmount: 198000, paymentMethod: 'cod', codUpfrontAmount: 36000 });
      paymentRepo.findOne.mockResolvedValue(null);
      mockAgentService.initiatePayment.mockResolvedValue({ success: true, providerRequestId: 'req', message: 'ok' });

      await service.initiatePayment({ orderId: 5, phone: '255700000000', provider: 'selcom' } as any, { id: 1 } as any);

      expect(mockAgentService.initiatePayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 36000 }));
    });

    it('refuses to initiate online payment for a zero-upfront COD order — S0 fails that closed', async () => {
      orderRepo.findOne.mockResolvedValue({ id: 5, status: OrderStatus.PENDING_PAYMENT, totalAmount: 60000, paymentMethod: 'cod', codUpfrontAmount: 0 });
      paymentRepo.findOne.mockResolvedValue(null);
      await expect(service.initiatePayment({ orderId: 5, phone: '255700000000', provider: 'selcom' } as any, { id: 1 } as any)).rejects.toThrow(BadRequestException);
      expect(mockAgentService.initiatePayment).not.toHaveBeenCalled();
    });

    it('binds the created Payment to the Order and records its purpose in metadata', async () => {
      orderRepo.findOne.mockResolvedValue({ id: 5, status: OrderStatus.PENDING_PAYMENT, totalAmount: 198000, paymentMethod: 'online', codUpfrontAmount: null });
      paymentRepo.findOne.mockResolvedValue(null);
      mockAgentService.initiatePayment.mockResolvedValue({ success: true, providerRequestId: 'req', message: 'ok' });

      await service.initiatePayment({ orderId: 5, phone: '255700000000', provider: 'selcom' } as any, { id: 1 } as any);

      expect(paymentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ order: expect.objectContaining({ id: 5 }), metadata: expect.stringContaining('"purpose":"ORDER_FULL"') }),
      );
    });

    // C1 regression tests (review comment 5774703073)
    it('C1: the Payment is saved BEFORE the provider is ever contacted, not after', async () => {
      orderRepo.findOne.mockResolvedValue({ id: 5, status: OrderStatus.PENDING_PAYMENT, totalAmount: 198000, paymentMethod: 'online', codUpfrontAmount: null });
      paymentRepo.findOne.mockResolvedValue(null);
      const order: string[] = [];
      paymentRepo.save.mockImplementation(async (x: any) => { order.push('save'); return { id: 1, ...x }; });
      mockAgentService.initiatePayment.mockImplementation(async () => { order.push('provider'); return { success: true, providerRequestId: 'req', message: 'ok' }; });

      await service.initiatePayment({ orderId: 5, phone: '255700000000', provider: 'selcom' } as any, { id: 1 } as any);

      expect(order).toEqual(['save', 'provider']);
    });

    it('C1: a durable Payment already carries our own reference as providerRequestId BEFORE the provider call resolves — a racing callback could already find it', async () => {
      orderRepo.findOne.mockResolvedValue({ id: 5, status: OrderStatus.PENDING_PAYMENT, totalAmount: 198000, paymentMethod: 'online', codUpfrontAmount: null });
      paymentRepo.findOne.mockResolvedValue(null);
      let savedProviderRequestId: string | undefined;
      paymentRepo.save.mockImplementation(async (x: any) => { savedProviderRequestId = x.providerRequestId; return { id: 1, ...x }; });
      mockAgentService.initiatePayment.mockImplementation(async (req: any) => {
        // At this exact moment (before initiatePayment() has returned), the durable row must
        // already exist and already carry the same reference the provider was just asked to use.
        expect(savedProviderRequestId).toBe(req.reference);
        return { success: true, providerRequestId: req.reference, message: 'ok' };
      });

      await service.initiatePayment({ orderId: 5, phone: '255700000000', provider: 'selcom' } as any, { id: 1 } as any);
      expect(mockAgentService.initiatePayment).toHaveBeenCalled();
    });

    it('C1: on provider initiation failure, the SAME Payment row is updated to FAILED — never a second row created', async () => {
      orderRepo.findOne.mockResolvedValue({ id: 5, status: OrderStatus.PENDING_PAYMENT, totalAmount: 198000, paymentMethod: 'online', codUpfrontAmount: null });
      paymentRepo.findOne.mockResolvedValue(null);
      mockAgentService.initiatePayment.mockResolvedValue({ success: false, providerRequestId: 'req', message: 'insufficient balance' });

      await expect(service.initiatePayment({ orderId: 5, phone: '255700000000', provider: 'selcom' } as any, { id: 1 } as any)).rejects.toThrow(BadRequestException);

      expect(paymentRepo.create).toHaveBeenCalledTimes(1);
      expect(paymentRepo.save).toHaveBeenCalledTimes(1);
      expect(paymentRepo.update).toHaveBeenCalledWith(1, expect.objectContaining({ status: PaymentStatus.FAILED, failureReason: 'insufficient balance' }));
    });

    it('C1: a thrown/rejected provider call also updates the SAME row to FAILED, never leaves it stuck PENDING silently', async () => {
      orderRepo.findOne.mockResolvedValue({ id: 5, status: OrderStatus.PENDING_PAYMENT, totalAmount: 198000, paymentMethod: 'online', codUpfrontAmount: null });
      paymentRepo.findOne.mockResolvedValue(null);
      mockAgentService.initiatePayment.mockRejectedValue(new Error('network timeout'));

      await expect(service.initiatePayment({ orderId: 5, phone: '255700000000', provider: 'selcom' } as any, { id: 1 } as any)).rejects.toThrow(BadRequestException);

      expect(paymentRepo.update).toHaveBeenCalledWith(1, expect.objectContaining({ status: PaymentStatus.FAILED }));
    });
  });

  describe('customerPayInvoice() — S0 fix: binds Payment.order for an order-type invoice', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
    });

    it('binds the created Payment to the Order — this is what lets the NORMAL webhook route confirm a real checkout order', async () => {
      invoiceRepo.findOne.mockResolvedValue({ invoiceNumber: 'INV-1', order: { id: 42 }, amount: 198000, status: 'awaiting_payment' });
      orderRepo.findOne.mockResolvedValue({ id: 42, paymentMethod: 'online', totalAmount: 198000, codUpfrontAmount: null });
      mockAgentService.initiatePayment.mockResolvedValue({ success: true, providerRequestId: 'req', message: 'ok' });

      await service.customerPayInvoice('INV-1', '255700000000', 'selcom', { id: 1 } as any);

      expect(paymentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ order: { id: 42 } }),
      );
    });

    it('does not bind an order for a classified/manual invoice (no Order exists for it)', async () => {
      invoiceRepo.findOne.mockResolvedValue(null);
      classifiedInvoiceRepo.findOne.mockResolvedValue({ invoiceNumber: 'CINV-1', amount: 50000, status: 'sent', isCod: false, buyer: {}, seller: {} });
      mockAgentService.initiatePayment.mockResolvedValue({ success: true, providerRequestId: 'req', message: 'ok' });

      await service.customerPayInvoice('CINV-1', '255700000000', 'selcom', { id: 1 } as any);

      const createArgs = paymentRepo.create.mock.calls[0][0];
      expect(createArgs.order).toBeUndefined();
    });

    it('C1: the Payment is saved BEFORE the provider is contacted, and initiation failure updates the SAME row', async () => {
      invoiceRepo.findOne.mockResolvedValue({ invoiceNumber: 'INV-1', order: { id: 42 }, amount: 198000, status: 'awaiting_payment' });
      orderRepo.findOne.mockResolvedValue({ id: 42, paymentMethod: 'online', totalAmount: 198000, codUpfrontAmount: null });
      const order: string[] = [];
      paymentRepo.save.mockImplementation(async (x: any) => { order.push('save'); return { id: 1, ...x }; });
      mockAgentService.initiatePayment.mockImplementation(async () => { order.push('provider'); return { success: false, providerRequestId: 'req', message: 'declined' }; });

      await expect(service.customerPayInvoice('INV-1', '255700000000', 'selcom', { id: 1 } as any)).rejects.toThrow(BadRequestException);

      expect(order).toEqual(['save', 'provider']);
      expect(paymentRepo.create).toHaveBeenCalledTimes(1);
      expect(paymentRepo.update).toHaveBeenCalledWith(1, expect.objectContaining({ status: PaymentStatus.FAILED, failureReason: 'declined' }));
    });
  });

  describe('adminVerifyPayment() — the explicit re-verify, rate-limited', () => {
    it('rejects a second attempt for the same payment within the cooldown window', async () => {
      paymentRepo.findOne.mockResolvedValue({ id: 3, status: PaymentStatus.PENDING, provider: 'selcom', providerRequestId: 'req-1', metadata: null });
      selcomService.verifyPayment.mockResolvedValue({ status: 'PENDING', amountMinor: null, currency: null, providerReference: null });
      // C6: PENDING is NOT_YET_SETTLED, never PROVIDER_NOT_SUCCESS — it must not authorise or reset anything.
      paymentConfirmation.confirmVerifiedPayment.mockResolvedValue({ status: 'NOT_YET_SETTLED', paymentId: 3, providerStatus: 'PENDING' });
      process.env.NODE_ENV = 'production';
      process.env.PAYMENTS_ENABLED_PROVIDERS = 'selcom';

      await service.adminVerifyPayment(3);
      await expect(service.adminVerifyPayment(3)).rejects.toThrow(BadRequestException);
      expect(selcomService.verifyPayment).toHaveBeenCalledTimes(1);
    });

    it('is a no-op for an already-SUCCESS payment (no provider call)', async () => {
      paymentRepo.findOne.mockResolvedValue({ id: 4, status: PaymentStatus.SUCCESS });
      const result = await service.adminVerifyPayment(4);
      expect(result.outcome).toEqual({ status: 'ALREADY_CONFIRMED', paymentId: 4 });
      expect(selcomService.verifyPayment).not.toHaveBeenCalled();
    });
  });

  describe('C6 — NOT_YET_SETTLED authorises nothing and resets nothing (distinct from a terminal failure)', () => {
    it('a NOT_YET_SETTLED outcome does not reset the invoice for retry', async () => {
      paymentRepo.findOne.mockResolvedValue({ id: 20, status: PaymentStatus.PENDING, provider: 'selcom', providerRequestId: 'req-x', metadata: JSON.stringify({ invoiceType: 'order', orderId: 42 }) });
      selcomService.verifyPayment.mockResolvedValue({ status: 'PROCESSING', amountMinor: null, currency: null, providerReference: null });
      paymentConfirmation.confirmVerifiedPayment.mockResolvedValue({ status: 'NOT_YET_SETTLED', paymentId: 20, providerStatus: 'PROCESSING' });
      process.env.NODE_ENV = 'production';
      process.env.PAYMENTS_ENABLED_PROVIDERS = 'selcom';

      await service.adminVerifyPayment(20);

      expect(invoiceRepo.update).not.toHaveBeenCalled();
    });

    it('a genuine terminal failure (e.g. AMOUNT_MISMATCH) DOES reset the invoice for retry', async () => {
      paymentRepo.findOne.mockResolvedValue({ id: 21, status: PaymentStatus.PENDING, provider: 'selcom', providerRequestId: 'req-y', metadata: JSON.stringify({ invoiceType: 'order', orderId: 42 }) });
      selcomService.verifyPayment.mockResolvedValue({ status: 'SUCCESS', amountMinor: 1, currency: 'TZS', providerReference: 'ref' });
      paymentConfirmation.confirmVerifiedPayment.mockResolvedValue({ status: 'AMOUNT_MISMATCH', paymentId: 21 });
      process.env.NODE_ENV = 'production';
      process.env.PAYMENTS_ENABLED_PROVIDERS = 'selcom';

      await service.adminVerifyPayment(21);

      expect(invoiceRepo.update).toHaveBeenCalledWith({ order: { id: 42 } }, expect.objectContaining({ status: 'awaiting_payment', agentId: null }));
    });
  });
});
