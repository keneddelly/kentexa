import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentStatus } from './entities/payment.entity';

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

  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    paymentRepo = {
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(),
      find: jest.fn(),
    };
    payoutRepo = { findOne: jest.fn(), save: jest.fn() };
    orderRepo = { findOne: jest.fn(), update: jest.fn() };
    invoiceRepo = { findOne: jest.fn() };
    classifiedInvoiceRepo = { findOne: jest.fn(), update: jest.fn() };
    agentRepo = { findOne: jest.fn() };
    agentTransactionRepo = { findOne: jest.fn(), save: jest.fn(), create: jest.fn() };
    vodacomService = { initiatePayment: jest.fn(), parseCallback: jest.fn() };
    airtelService = { initiatePayment: jest.fn(), parseCallback: jest.fn() };
    selcomService = { initiatePayment: jest.fn(), parseCallback: jest.fn() };
    mockAgentService = { initiatePayment: jest.fn(), parseCallback: jest.fn() };
    // Was previously missing from this constructor call entirely — every
    // param below actually landed one slot early (this mock ended up bound
    // as clickPesaService, invoicesService as notificationsService, etc.),
    // so any test touching a service past mockAgentService was silently
    // exercising the wrong mock.
    clickPesaService = { initiatePayment: jest.fn(), parseCallback: jest.fn() };
    notificationsService = { orderPaid: jest.fn(), classifiedInvoicePaid: jest.fn() };
    invoicesService = { findByOrderId: jest.fn(async () => null) };
    activityEvents = { record: jest.fn() };
    commerceProfiles = { findForUserByType: jest.fn(async () => null) };
    walletService = {};
    reputationService = {};
    conversationService = {};
    businessCustomerService = { findOrCreateForChat: jest.fn(async () => null) };
    communicationEngine = { dispatch: jest.fn(async () => undefined) };

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
    );
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  // Regression: getProvider('mock') used to be honored in production,
  // letting anyone mark a payment SUCCESS for free.
  describe('getProvider() production guard', () => {
    it('never returns the mock provider in production, even when asked for "mock"', () => {
      process.env.NODE_ENV = 'production';
      const provider = (service as any).getProvider('mock');
      expect(provider).toBe(selcomService);
      expect(provider).not.toBe(mockAgentService);
    });

    it('uses the mock provider outside production', () => {
      process.env.NODE_ENV = 'test';
      const provider = (service as any).getProvider('selcom');
      expect(provider).toBe(mockAgentService);
    });
  });

  // Regression: mockAgentConfirm/mockAgentCallback was reachable in
  // production with no guard, letting anyone confirm any payment.
  describe('mockAgentCallback() production guard', () => {
    it('throws ForbiddenException in production', async () => {
      process.env.NODE_ENV = 'production';
      await expect(service.mockAgentCallback('req-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('delegates to agentPaymentCallback outside production', async () => {
      process.env.NODE_ENV = 'test';
      const spy = jest
        .spyOn(service, 'agentPaymentCallback')
        .mockResolvedValue({ message: 'OK' } as any);
      await service.mockAgentCallback('req-1');
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'SUCCESS', providerRequestId: 'req-1' }),
        'mock',
      );
    });
  });

  // Regression: a duplicated webhook delivery used to re-run order
  // confirmation on every retry since there was no terminal-state check.
  describe('handleCallback() idempotency', () => {
    it('no-ops for a payment that is already SUCCESS', async () => {
      selcomService.parseCallback.mockReturnValue({
        providerRequestId: 'req-1',
        success: true,
      });
      paymentRepo.findOne.mockResolvedValue({
        providerRequestId: 'req-1',
        status: PaymentStatus.SUCCESS,
        order: { id: 5 },
      });
      process.env.NODE_ENV = 'production';

      const result = await service.handleCallback({}, 'selcom');

      expect(result).toEqual({ message: 'OK' });
      expect(paymentRepo.save).not.toHaveBeenCalled();
      expect(orderRepo.update).not.toHaveBeenCalled();
    });

    it('settles a still-pending payment and confirms the order', async () => {
      selcomService.parseCallback.mockReturnValue({
        providerRequestId: 'req-2',
        success: true,
        providerReference: 'ref-2',
      });
      paymentRepo.findOne.mockResolvedValue({
        providerRequestId: 'req-2',
        status: PaymentStatus.PENDING,
        order: { id: 5 },
      });
      orderRepo.findOne.mockResolvedValue(null);
      process.env.NODE_ENV = 'production';

      const result = await service.handleCallback({}, 'selcom');

      expect(result).toEqual({ message: 'OK' });
      expect(paymentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PaymentStatus.SUCCESS }),
      );
      expect(orderRepo.update).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ paymentStatus: 'paid' }),
      );
    });
  });

  // Regression: a double-tap on "pay" (or a slow first STK push) used to
  // fire a second, fully independent payment request for the same order.
  describe('initiatePayment() duplicate-in-flight guard', () => {
    it('blocks a new request while one is already pending', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 5,
        paymentStatus: 'pending',
        totalAmount: 1000,
      });
      paymentRepo.findOne.mockResolvedValue({
        id: 1,
        status: PaymentStatus.PENDING,
      });
      process.env.NODE_ENV = 'production';

      await expect(
        service.initiatePayment(
          { orderId: 5, phone: '+255700000000', provider: 'selcom' } as any,
          { id: 1 } as any,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(selcomService.initiatePayment).not.toHaveBeenCalled();
    });
  });

  // Regression: handleCallback() — the webhook route Airtel/Vodacom actually
  // call — never checked payment.metadata at all, so a classified/manual
  // invoice paid directly by a buyer via real mobile money never flipped to
  // PAID; only the separately-routed agentPaymentCallback() did. See
  // plans/mutable-meandering-dongarra.md.
  describe('handleCallback() classified/manual invoice branch', () => {
    it('marks a classified invoice PAID when the payment has no linked order', async () => {
      selcomService.parseCallback.mockReturnValue({
        providerRequestId: 'req-3',
        success: true,
        providerReference: 'ref-3',
      });
      paymentRepo.findOne.mockResolvedValue({
        providerRequestId: 'req-3',
        status: PaymentStatus.PENDING,
        order: null,
        metadata: JSON.stringify({ invoiceType: 'classified', invoiceNumber: 'INV-9' }),
      });
      classifiedInvoiceRepo.findOne.mockResolvedValue({
        invoiceNumber: 'INV-9',
        amount: 50000,
        buyerMessage: 'Name: Amina | Phone: 255700000000',
        buyer: { email: 'a@x.com', phone: '255700000000', name: 'Amina' },
        seller: { email: 's@x.com', phone: '255711111111', name: 'Seller' },
      });
      process.env.NODE_ENV = 'production';

      const result = await service.handleCallback({}, 'selcom');

      expect(result).toEqual({ message: 'OK' });
      expect(classifiedInvoiceRepo.update).toHaveBeenCalledWith(
        { invoiceNumber: 'INV-9' },
        expect.objectContaining({ status: 'paid', transactionReference: 'ref-3' }),
      );
      expect(notificationsService.classifiedInvoicePaid).toHaveBeenCalled();
    });

    it('does nothing for a payment with no order and no classified/manual metadata', async () => {
      selcomService.parseCallback.mockReturnValue({
        providerRequestId: 'req-4',
        success: true,
      });
      paymentRepo.findOne.mockResolvedValue({
        providerRequestId: 'req-4',
        status: PaymentStatus.PENDING,
        order: null,
        metadata: null,
      });
      process.env.NODE_ENV = 'production';

      const result = await service.handleCallback({}, 'selcom');

      expect(result).toEqual({ message: 'OK' });
      expect(classifiedInvoiceRepo.update).not.toHaveBeenCalled();
    });
  });
});
