import { PaymentEvidenceService } from './payment-evidence.service';
import { buildEvidenceMetadata } from './payment-evidence';

const sealInput = (over: any = {}) => ({
  paymentId: 1, orderId: 100, invoiceNumber: null, amountMinor: 3600000, currency: 'TZS',
  provider: 'clickpesa', providerReference: 'CP-REF-1', purpose: 'COD_DEPOSIT', ...over,
});

describe('PaymentEvidenceService.check', () => {
  const OLD_ENV = process.env;
  let paymentRepo: any;
  let service: PaymentEvidenceService;

  beforeEach(() => {
    process.env = { ...OLD_ENV, PAYMENT_EVIDENCE_SEAL_KEY: 'test-key' };
    paymentRepo = { query: jest.fn() };
    service = new PaymentEvidenceService(paymentRepo);
  });
  afterAll(() => { process.env = OLD_ENV; });

  it('a non-checkout order (seller_shipment) is not applicable — always passes without querying Payment', async () => {
    const result = await service.check({ id: 1, source: 'seller_shipment', paymentMethod: 'cod', totalAmount: 60000, codUpfrontAmount: 0 });
    expect(result).toEqual({ applicable: false, sufficient: true, purpose: null, requiredMinor: 0, totalMinor: 0 });
    expect(paymentRepo.query).not.toHaveBeenCalled();
  });

  it('an ONLINE order with no Payment rows at all is insufficient', async () => {
    paymentRepo.query.mockResolvedValue([]);
    const result = await service.check({ id: 100, source: 'online', paymentMethod: 'online', totalAmount: 198000, codUpfrontAmount: null });
    expect(result.applicable).toBe(true);
    expect(result.sufficient).toBe(false);
    expect(result.purpose).toBe('ORDER_FULL');
    expect(result.requiredMinor).toBe(19800000);
  });

  it('an ONLINE order with a genuine sealed Payment covering the full total is sufficient', async () => {
    const meta = buildEvidenceMetadata(sealInput({ purpose: 'ORDER_FULL', amountMinor: 19800000 }));
    paymentRepo.query.mockResolvedValue([
      { id: 1, status: 'success', provider: 'clickpesa', orderId: 100, providerReference: 'CP-REF-1', metadata: JSON.stringify({ ...meta, purpose: 'ORDER_FULL', amountMinor: 19800000 }) },
    ]);
    const result = await service.check({ id: 100, source: 'online', paymentMethod: 'online', totalAmount: 198000, codUpfrontAmount: null });
    expect(result.sufficient).toBe(true);
    expect(result.totalMinor).toBe(19800000);
  });

  it('a COD order requires only the deposit, not the full total, and is satisfied by a sealed deposit payment', async () => {
    const meta = buildEvidenceMetadata(sealInput());
    paymentRepo.query.mockResolvedValue([
      { id: 1, status: 'success', provider: 'clickpesa', orderId: 100, providerReference: 'CP-REF-1', metadata: JSON.stringify(meta) },
    ]);
    const result = await service.check({ id: 100, source: 'online', paymentMethod: 'cod', totalAmount: 180000, codUpfrontAmount: 36000 });
    expect(result.purpose).toBe('COD_DEPOSIT');
    expect(result.requiredMinor).toBe(3600000);
    expect(result.sufficient).toBe(true);
  });

  it('a COD order with a shortfall (deposit only partially evidenced) is insufficient', async () => {
    const meta = buildEvidenceMetadata(sealInput({ amountMinor: 1000000 }));
    paymentRepo.query.mockResolvedValue([
      { id: 1, status: 'success', provider: 'clickpesa', orderId: 100, providerReference: 'CP-REF-1', metadata: JSON.stringify({ ...meta, amountMinor: 1000000 }) },
    ]);
    const result = await service.check({ id: 100, source: 'online', paymentMethod: 'cod', totalAmount: 180000, codUpfrontAmount: 36000 });
    expect(result.sufficient).toBe(false);
    expect(result.totalMinor).toBe(1000000);
  });

  it('a zero-upfront COD order FAILS CLOSED in S0 — never auto-sufficient just because codUpfrontAmount is 0', async () => {
    const result = await service.check({ id: 100, source: 'online', paymentMethod: 'cod', totalAmount: 60000, codUpfrontAmount: 0 });
    expect(result.applicable).toBe(true);
    expect(result.sufficient).toBe(false);
    expect(result.reason).toBe('ZERO_UPFRONT_COD_FAILS_CLOSED_IN_S0');
    expect(paymentRepo.query).not.toHaveBeenCalled();
  });

  it('an unsealed forged Payment row does not satisfy evidence even if amount/purpose look right', async () => {
    paymentRepo.query.mockResolvedValue([
      { id: 1, status: 'success', provider: 'clickpesa', orderId: 100, providerReference: 'FORGED', metadata: JSON.stringify({ purpose: 'ORDER_FULL', currency: 'TZS', amountMinor: 19800000 }) },
    ]);
    const result = await service.check({ id: 100, source: 'online', paymentMethod: 'online', totalAmount: 198000, codUpfrontAmount: null });
    expect(result.sufficient).toBe(false);
  });
});
