import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getPCTestConnectionConfig, resetPCTestSchema, PC_ENTITIES } from './payment-confirmation-test-db';
import { PaymentConfirmationService } from './payment-confirmation.service';
import { User } from '../users/entities/user.entity';
import { Product } from '../products/entities/products.entity';
import { Order, OrderStatus, OrderPaymentMethod, EscrowStatus, PaymentStatus as OrderPaymentStatus, OrderSource } from '../orders/entities/order.entity';
import { Invoice, InvoiceStatus } from '../invoices/entities/invoice.entity';
import { ClassifiedInvoiceRequest, ClassifiedInvoiceStatus } from '../classifieds/entities/classified-invoice-request.entity';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { isValidEvidenceRow } from './payment-evidence';
import { ProviderVerification } from './providers/payment-provider.interface';

const config = getPCTestConnectionConfig();
const describeIfDb = config ? describe : describe.skip;

describeIfDb('PaymentConfirmationService — real Postgres', () => {
  let dataSource: DataSource;
  let service: PaymentConfirmationService;
  let seq = 0;

  beforeAll(async () => {
    process.env.PAYMENT_EVIDENCE_SEAL_KEY = 'test-seal-key';
    const client = new Client(config as any);
    await client.connect();
    await resetPCTestSchema(client);
    await client.end();

    dataSource = new DataSource({
      type: 'postgres',
      host: config!.host,
      port: config!.port,
      username: config!.user,
      password: config!.password,
      database: config!.database,
      synchronize: true,
      entities: PC_ENTITIES,
    });
    await dataSource.initialize();
    service = new PaymentConfirmationService(dataSource);
  }, 60000);

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  const makeUser = async (): Promise<User> => {
    seq += 1;
    return dataSource.getRepository(User).save(dataSource.getRepository(User).create({ name: `User ${seq}`, email: `u${seq}@test.local`, password: 'hashed-test-password' }));
  };

  const makeProduct = async (sellerId: number, productType = 'physical'): Promise<Product> => {
    seq += 1;
    return dataSource.getRepository(Product).save(
      dataSource.getRepository(Product).create({ name: `Product ${seq}`, seller: { id: sellerId } as any, productType } as any),
    );
  };

  const makeOrder = async (over: Partial<Order> & { sellerId?: number; buyerId?: number; productId?: number } = {}): Promise<Order> => {
    seq += 1;
    const { sellerId, buyerId, productId, ...rest } = over;
    return dataSource.getRepository(Order).save(
      dataSource.getRepository(Order).create({
        quantity: 1,
        totalAmount: 198000,
        sellerAmount: 180000,
        source: OrderSource.ONLINE,
        status: OrderStatus.PENDING_PAYMENT,
        paymentStatus: OrderPaymentStatus.PENDING,
        paymentMethod: OrderPaymentMethod.ONLINE,
        escrowStatus: EscrowStatus.HOLDING,
        ...(sellerId ? { seller: { id: sellerId } as any } : {}),
        ...(buyerId ? { buyer: { id: buyerId } as any } : {}),
        ...(productId ? { product: { id: productId } as any } : {}),
        ...rest,
      } as any),
    );
  };

  const makePayment = async (over: Partial<Payment> & { orderId?: number | null; metadata?: Record<string, unknown> } = {}): Promise<Payment> => {
    seq += 1;
    const { orderId, metadata, ...rest } = over;
    return dataSource.getRepository(Payment).save(
      dataSource.getRepository(Payment).create({
        phone: '255700000000',
        amount: 198000,
        provider: 'clickpesa',
        status: PaymentStatus.PENDING,
        providerRequestId: `REQ${seq}`,
        ...(orderId !== undefined ? { order: orderId === null ? null : ({ id: orderId } as any) } : {}),
        ...(metadata ? { metadata: JSON.stringify(metadata) } : {}),
        ...rest,
      } as any),
    );
  };

  const orderRow = (id: number) => dataSource.getRepository(Order).findOne({ where: { id } });
  const paymentRow = (id: number) => dataSource.getRepository(Payment).findOne({ where: { id } });
  const invoiceRow = (orderId: number) => dataSource.getRepository(Invoice).findOne({ where: { order: { id: orderId } } });

  const successVerification = (amountMinor: number, providerReference = `REF${Math.random()}`): ProviderVerification => ({
    status: 'SUCCESS',
    amountMinor,
    currency: 'TZS',
    providerReference,
  });

  it('§0 test database reachable', () => expect(dataSource.isInitialized).toBe(true));

  it('full ONLINE payment confirms correctly: order -> paid, invoice -> PAID, Payment sealed & valid evidence', async () => {
    const seller = await makeUser();
    const buyer = await makeUser();
    const order = await makeOrder({ sellerId: seller.id, buyerId: buyer.id, totalAmount: 198000 });
    await dataSource.getRepository(Invoice).save(
      dataSource.getRepository(Invoice).create({ invoiceNumber: `INV-${order.id}`, order: { id: order.id } as any, amount: 198000, status: InvoiceStatus.AWAITING_PAYMENT }),
    );
    const payment = await makePayment({ orderId: order.id, amount: 198000, metadata: { purpose: 'ORDER_FULL' } });

    const outcome = await service.confirmVerifiedPayment(payment.id, successVerification(19800000, 'CP-REF-A'));

    expect(outcome).toMatchObject({ status: 'CONFIRMED', orderTransition: 'ORDER_PAID' });
    const order2 = await orderRow(order.id);
    expect(order2).toMatchObject({ status: 'paid', paymentStatus: 'paid' });
    const invoice2 = await invoiceRow(order.id);
    expect(invoice2).toMatchObject({ status: InvoiceStatus.PAID, transactionReference: 'CP-REF-A' });

    const payment2 = await paymentRow(payment.id);
    const meta = JSON.parse(payment2!.metadata!);
    const evidence = isValidEvidenceRow(
      { id: payment2!.id, status: payment2!.status, provider: payment2!.provider, orderId: order.id, providerReference: payment2!.providerReference, metadata: payment2!.metadata },
      { orderId: order.id, purpose: 'ORDER_FULL' },
    );
    expect(evidence).toMatchObject({ ok: true, amountMinor: 19800000 });
    expect(meta.seal).toBeTruthy();
  });

  it('COD deposit payment confirms to preparing/upfront_paid — never full "paid"', async () => {
    const seller = await makeUser();
    const order = await makeOrder({ sellerId: seller.id, paymentMethod: OrderPaymentMethod.COD, totalAmount: 180000, codUpfrontAmount: 36000 as any, codRemainingBalance: 144000 as any });
    const payment = await makePayment({ orderId: order.id, amount: 36000, metadata: { purpose: 'COD_DEPOSIT' } });

    const outcome = await service.confirmVerifiedPayment(payment.id, successVerification(3600000, 'CP-REF-COD'));

    expect(outcome).toMatchObject({ status: 'CONFIRMED', orderTransition: 'COD_DEPOSIT_CONFIRMED' });
    const order2 = await orderRow(order.id);
    expect(order2).toMatchObject({ status: 'preparing', paymentStatus: 'upfront_paid' });
  });

  it('a digital product order completes atomically: status completed, escrow released, fundsReleasedAt set', async () => {
    const seller = await makeUser();
    const product = await makeProduct(seller.id, 'digital');
    const order = await makeOrder({ sellerId: seller.id, productId: product.id, totalAmount: 5000 });
    const payment = await makePayment({ orderId: order.id, amount: 5000, metadata: { purpose: 'ORDER_FULL' } });

    const outcome = await service.confirmVerifiedPayment(payment.id, successVerification(500000, 'CP-REF-DIGITAL'));

    expect(outcome).toMatchObject({ status: 'CONFIRMED', orderTransition: 'DIGITAL_COMPLETED' });
    const order2 = await orderRow(order.id);
    expect(order2).toMatchObject({ status: 'completed', paymentStatus: 'paid', escrowStatus: 'released' });
    expect(order2!.fundsReleasedAt).toBeTruthy();
  });

  it('retry: confirming the SAME already-SUCCESS payment is idempotent (ALREADY_CONFIRMED, no re-processing)', async () => {
    const seller = await makeUser();
    const order = await makeOrder({ sellerId: seller.id, totalAmount: 10000 });
    const payment = await makePayment({ orderId: order.id, amount: 10000, metadata: { purpose: 'ORDER_FULL' } });

    await service.confirmVerifiedPayment(payment.id, successVerification(1000000, 'CP-REF-RETRY'));
    const second = await service.confirmVerifiedPayment(payment.id, successVerification(1000000, 'CP-REF-RETRY'));

    expect(second).toEqual({ status: 'ALREADY_CONFIRMED', paymentId: payment.id });
    const order2 = await orderRow(order.id);
    expect(order2!.status).toBe('paid'); // unchanged by the retry, not re-applied
  });

  it('a provider FAILED verification marks the Payment failed and leaves the order untouched', async () => {
    const seller = await makeUser();
    const order = await makeOrder({ sellerId: seller.id });
    const payment = await makePayment({ orderId: order.id, amount: 198000, metadata: { purpose: 'ORDER_FULL' } });

    const outcome = await service.confirmVerifiedPayment(payment.id, { status: 'FAILED', amountMinor: null, currency: null, providerReference: null });

    expect(outcome).toEqual({ status: 'PROVIDER_NOT_SUCCESS', paymentId: payment.id, providerStatus: 'FAILED' });
    expect((await orderRow(order.id))!.status).toBe('pending_payment');
    expect((await paymentRow(payment.id))!.status).toBe(PaymentStatus.FAILED);
  });

  it('an amount mismatch is rejected — the provider cannot dictate a different amount than our own stored obligation', async () => {
    const seller = await makeUser();
    const order = await makeOrder({ sellerId: seller.id, totalAmount: 198000 });
    const payment = await makePayment({ orderId: order.id, amount: 198000, metadata: { purpose: 'ORDER_FULL' } });

    const outcome = await service.confirmVerifiedPayment(payment.id, successVerification(1, 'CP-REF-SHORT')); // provider says 0.01 TZS arrived

    expect(outcome).toEqual({ status: 'AMOUNT_MISMATCH', paymentId: payment.id });
    expect((await orderRow(order.id))!.status).toBe('pending_payment');
    expect((await paymentRow(payment.id))!.failureReason).toBe('AMOUNT_MISMATCH');
  });

  it('a currency mismatch is rejected', async () => {
    const seller = await makeUser();
    const order = await makeOrder({ sellerId: seller.id, totalAmount: 198000 });
    const payment = await makePayment({ orderId: order.id, amount: 198000, metadata: { purpose: 'ORDER_FULL' } });

    const outcome = await service.confirmVerifiedPayment(payment.id, { status: 'SUCCESS', amountMinor: 19800000, currency: 'USD', providerReference: 'X' });

    expect(outcome).toEqual({ status: 'CURRENCY_MISMATCH', paymentId: payment.id });
  });

  it('a provider reference already used by a DIFFERENT successful payment is rejected (no double-spend of one transaction as evidence for two payments)', async () => {
    const seller = await makeUser();
    const orderA = await makeOrder({ sellerId: seller.id, totalAmount: 10000 });
    const orderB = await makeOrder({ sellerId: seller.id, totalAmount: 10000 });
    const paymentA = await makePayment({ orderId: orderA.id, amount: 10000, metadata: { purpose: 'ORDER_FULL' } });
    const paymentB = await makePayment({ orderId: orderB.id, amount: 10000, metadata: { purpose: 'ORDER_FULL' } });

    await service.confirmVerifiedPayment(paymentA.id, successVerification(1000000, 'SHARED-REF'));
    const outcomeB = await service.confirmVerifiedPayment(paymentB.id, successVerification(1000000, 'SHARED-REF'));

    expect(outcomeB).toEqual({ status: 'REFERENCE_REUSED', paymentId: paymentB.id });
    expect((await orderRow(orderB.id))!.status).toBe('pending_payment');
  });

  it('a CANCELLED order cannot be revived by a late/forged-looking successful verification — payment is recorded, order is left alone', async () => {
    const seller = await makeUser();
    const order = await makeOrder({ sellerId: seller.id, status: OrderStatus.CANCELLED, totalAmount: 5000 });
    const payment = await makePayment({ orderId: order.id, amount: 5000, metadata: { purpose: 'ORDER_FULL' } });

    const outcome = await service.confirmVerifiedPayment(payment.id, successVerification(500000, 'CP-REF-CANCELLED'));

    expect(outcome).toMatchObject({ status: 'CONFIRMED', orderTransition: 'INELIGIBLE' });
    expect((await orderRow(order.id))!.status).toBe('cancelled'); // never revived
    expect((await paymentRow(payment.id))!.status).toBe(PaymentStatus.SUCCESS); // money genuinely arrived — recorded, not discarded
  });

  it('a COMPLETED order is likewise never re-triggered by a duplicate confirmation for a NEW payment row', async () => {
    const seller = await makeUser();
    const order = await makeOrder({ sellerId: seller.id, status: OrderStatus.COMPLETED, totalAmount: 5000 });
    const payment = await makePayment({ orderId: order.id, amount: 5000, metadata: { purpose: 'ORDER_FULL' } });
    const outcome = await service.confirmVerifiedPayment(payment.id, successVerification(500000, 'CP-REF-COMPLETED'));
    expect(outcome).toMatchObject({ orderTransition: 'INELIGIBLE' });
  });

  it('a classified/manual invoice (no bound Order) transitions to PAID exactly once', async () => {
    const seller = await makeUser();
    const invoice = await dataSource.getRepository(ClassifiedInvoiceRequest).save(
      dataSource.getRepository(ClassifiedInvoiceRequest).create({ seller: { id: seller.id } as any, invoiceNumber: `CINV-${Date.now()}`, amount: 50000, status: ClassifiedInvoiceStatus.SENT }),
    );
    const payment = await makePayment({ orderId: null, amount: 50000, metadata: { purpose: 'CLASSIFIED_INVOICE', invoiceType: 'classified', invoiceNumber: invoice.invoiceNumber } });

    const outcome = await service.confirmVerifiedPayment(payment.id, successVerification(5000000, 'CP-REF-CLASSIFIED'));

    expect(outcome).toMatchObject({ status: 'CONFIRMED', classifiedInvoiceNumber: invoice.invoiceNumber, classifiedTransitioned: true });
    const invoice2 = await dataSource.getRepository(ClassifiedInvoiceRequest).findOne({ where: { id: invoice.id } });
    expect(invoice2!.status).toBe(ClassifiedInvoiceStatus.PAID);

    // retry converges without re-transitioning (already PAID)
    const paymentRetry = await makePayment({ orderId: null, amount: 50000, metadata: { purpose: 'CLASSIFIED_INVOICE', invoiceType: 'classified', invoiceNumber: invoice.invoiceNumber } });
    const retryOutcome = await service.confirmVerifiedPayment(paymentRetry.id, successVerification(5000000, 'CP-REF-CLASSIFIED-2'));
    expect(retryOutcome).toMatchObject({ classifiedTransitioned: false });
  });

  it('a payment not found returns PAYMENT_NOT_FOUND, never throws uncontrollably', async () => {
    const outcome = await service.confirmVerifiedPayment(987654321, successVerification(1, 'X'));
    expect(outcome).toEqual({ status: 'PAYMENT_NOT_FOUND', paymentId: 987654321 });
  });

  describe('C2 correction — the CURRENT server-owned obligation is re-derived, not trusted from Payment.amount/metadata alone', () => {
    it('OBLIGATION_MISMATCH: a stored Payment.amount that disagrees with the order\'s CURRENT total can never become sealed evidence, even if the provider agrees with it', async () => {
      const seller = await makeUser();
      const order = await makeOrder({ sellerId: seller.id, totalAmount: 250000 }); // real obligation is 250,000
      const payment = await makePayment({ orderId: order.id, amount: 198000, metadata: { purpose: 'ORDER_FULL' } }); // wrongly-created Payment

      // the provider even agrees with the WRONG stored amount — this must still be rejected.
      const outcome = await service.confirmVerifiedPayment(payment.id, successVerification(19800000, 'CP-REF-OBLIGATION'));

      expect(outcome).toEqual({ status: 'OBLIGATION_MISMATCH', paymentId: payment.id });
      expect((await orderRow(order.id))!.status).toBe('pending_payment');
      expect((await paymentRow(payment.id))!.status).toBe(PaymentStatus.FAILED);
      expect((await paymentRow(payment.id))!.failureReason).toBe('OBLIGATION_MISMATCH');
    });

    it('PURPOSE_MISMATCH: a Payment recorded as ORDER_FULL for what is actually a COD order (whose real obligation is the deposit) cannot confirm', async () => {
      const seller = await makeUser();
      const order = await makeOrder({ sellerId: seller.id, paymentMethod: OrderPaymentMethod.COD, totalAmount: 180000, codUpfrontAmount: 36000 as any });
      // stored as the FULL total under the WRONG purpose, rather than the deposit under COD_DEPOSIT
      const payment = await makePayment({ orderId: order.id, amount: 180000, metadata: { purpose: 'ORDER_FULL' } });

      const outcome = await service.confirmVerifiedPayment(payment.id, successVerification(18000000, 'CP-REF-PURPOSE'));

      expect(outcome).toEqual({ status: 'PURPOSE_MISMATCH', paymentId: payment.id });
      expect((await orderRow(order.id))!.status).toBe('pending_payment');
    });

    it('a Payment whose obligation the order NO LONGER matches (order total changed after initiation) is rejected — the obligation is re-derived fresh, not cached', async () => {
      const seller = await makeUser();
      const order = await makeOrder({ sellerId: seller.id, totalAmount: 100000 });
      const payment = await makePayment({ orderId: order.id, amount: 100000, metadata: { purpose: 'ORDER_FULL' } });

      // the order's total is edited after the Payment was created (e.g. a price correction)
      await dataSource.getRepository(Order).update(order.id, { totalAmount: 120000 as any });

      const outcome = await service.confirmVerifiedPayment(payment.id, successVerification(10000000, 'CP-REF-STALE'));

      expect(outcome).toEqual({ status: 'OBLIGATION_MISMATCH', paymentId: payment.id });
    });
  });

  describe('C5 correction — a genuine provider SUCCESS must carry real provider transaction identity', () => {
    it('MISSING_PROVIDER_REFERENCE: a SUCCESS verification with no reference, for a Payment with no prior reference either, is rejected rather than synthesizing one', async () => {
      const seller = await makeUser();
      const order = await makeOrder({ sellerId: seller.id, totalAmount: 10000 });
      const payment = await makePayment({ orderId: order.id, amount: 10000, metadata: { purpose: 'ORDER_FULL' } });

      const outcome = await service.confirmVerifiedPayment(payment.id, { status: 'SUCCESS', amountMinor: 1000000, currency: 'TZS', providerReference: null });

      expect(outcome).toEqual({ status: 'MISSING_PROVIDER_REFERENCE', paymentId: payment.id });
      expect((await orderRow(order.id))!.status).toBe('pending_payment');
      const row = await paymentRow(payment.id);
      expect(row!.status).toBe(PaymentStatus.FAILED);
      // never a synthesized `${provider}-${id}`-shaped reference anywhere on the row — it stays null.
      expect(row!.providerReference).toBeNull();
    });

    it('a SUCCESS verification with no reference is still fine if the row ALREADY carries one from a prior attempt (not synthesis — reuse of a real value)', async () => {
      const seller = await makeUser();
      const order = await makeOrder({ sellerId: seller.id, totalAmount: 10000 });
      const payment = await makePayment({ orderId: order.id, amount: 10000, providerReference: 'CP-ALREADY-REAL', metadata: { purpose: 'ORDER_FULL' } });

      const outcome = await service.confirmVerifiedPayment(payment.id, { status: 'SUCCESS', amountMinor: 1000000, currency: 'TZS', providerReference: null });

      expect(outcome).toMatchObject({ status: 'CONFIRMED' });
      expect((await paymentRow(payment.id))!.providerReference).toBe('CP-ALREADY-REAL');
    });
  });

  describe('C6 correction — PENDING/PROCESSING/UNKNOWN is "not settled yet", never a terminal failure', () => {
    it('NOT_YET_SETTLED: a PENDING verification leaves the Payment exactly as PENDING, authorises nothing, and does not fail closed permanently', async () => {
      const seller = await makeUser();
      const order = await makeOrder({ sellerId: seller.id, totalAmount: 10000 });
      const payment = await makePayment({ orderId: order.id, amount: 10000, metadata: { purpose: 'ORDER_FULL' } });

      const outcome = await service.confirmVerifiedPayment(payment.id, { status: 'PENDING', amountMinor: null, currency: null, providerReference: null });

      expect(outcome).toEqual({ status: 'NOT_YET_SETTLED', paymentId: payment.id, providerStatus: 'PENDING' });
      expect((await paymentRow(payment.id))!.status).toBe(PaymentStatus.PENDING); // NOT failed
      expect((await orderRow(order.id))!.status).toBe('pending_payment');
    });

    it('PROCESSING/UNKNOWN behave the same way — never converted to FAILED', async () => {
      const seller = await makeUser();
      for (const status of ['PROCESSING', 'UNKNOWN'] as const) {
        const order = await makeOrder({ sellerId: seller.id, totalAmount: 10000 });
        const payment = await makePayment({ orderId: order.id, amount: 10000, metadata: { purpose: 'ORDER_FULL' } });
        const outcome = await service.confirmVerifiedPayment(payment.id, { status, amountMinor: null, currency: null, providerReference: null });
        expect(outcome).toEqual({ status: 'NOT_YET_SETTLED', paymentId: payment.id, providerStatus: status });
        expect((await paymentRow(payment.id))!.status).toBe(PaymentStatus.PENDING);
      }
    });

    it('a Payment that came back NOT_YET_SETTLED remains re-verifiable and confirms normally once the provider actually settles it', async () => {
      const seller = await makeUser();
      const order = await makeOrder({ sellerId: seller.id, totalAmount: 10000 });
      const payment = await makePayment({ orderId: order.id, amount: 10000, metadata: { purpose: 'ORDER_FULL' } });

      const first = await service.confirmVerifiedPayment(payment.id, { status: 'PROCESSING', amountMinor: null, currency: null, providerReference: null });
      expect(first.status).toBe('NOT_YET_SETTLED');

      const second = await service.confirmVerifiedPayment(payment.id, successVerification(1000000, 'CP-REF-SETTLED-LATER'));
      expect(second).toMatchObject({ status: 'CONFIRMED', orderTransition: 'ORDER_PAID' });
      expect((await orderRow(order.id))!.status).toBe('paid');
    });

    it('terminal FAILED (distinct from PENDING/PROCESSING) still authorises nothing and cannot later be resurrected by this same confirmVerifiedPayment call', async () => {
      const seller = await makeUser();
      const order = await makeOrder({ sellerId: seller.id, totalAmount: 10000 });
      const payment = await makePayment({ orderId: order.id, amount: 10000, metadata: { purpose: 'ORDER_FULL' } });

      const outcome = await service.confirmVerifiedPayment(payment.id, { status: 'FAILED', amountMinor: null, currency: null, providerReference: null });
      expect(outcome).toEqual({ status: 'PROVIDER_NOT_SUCCESS', paymentId: payment.id, providerStatus: 'FAILED' });
      expect((await paymentRow(payment.id))!.status).toBe(PaymentStatus.FAILED);
      expect((await orderRow(order.id))!.status).toBe('pending_payment');
    });
  });
});
