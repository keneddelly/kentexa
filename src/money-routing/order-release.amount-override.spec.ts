import { OrderReleaseService } from './order-release.service';

// Same isolation strategy as order-release.payment-evidence-backstop.spec.ts:
// resolveOrderRoutingTarget is stubbed to a fixed resolvable target so this
// file can focus purely on the new `amount` override (S0/I2G Issue #12 —
// COD delivery's real payout is order.sellerAmount minus a handling fee only
// known at delivery time, so it must NOT be re-derived from order.sellerAmount
// the way every other caller correctly relies on).
jest.mock('./order-routing-target', () => {
  const actual = jest.requireActual('./order-routing-target');
  const { MoneyRoutingTargetType } = jest.requireActual('./entities/money-routing-entry.entity');
  return {
    ...actual,
    resolveOrderRoutingTarget: jest.fn(async () => ({ kind: 'TARGET', targetType: MoneyRoutingTargetType.PERSONAL_USER, userId: 5, workspaceId: null })),
  };
});

describe('OrderReleaseService — amount override (COD net-of-fee payout)', () => {
  let dataSource: any;
  let routing: any;
  let paymentEvidence: any;
  let service: OrderReleaseService;
  let queries: Array<{ sql: string; params: any[] }>;

  // Deliberately non-COD-adjusted gross sellerAmount, matching what a real
  // Order row would hold — the whole point of this suite is proving the
  // override amount is used INSTEAD of this value, not alongside/averaged
  // with it.
  const baseOrderRow = {
    id: 42,
    sellerId: 5,
    sellerAmount: '10000.00',
    escrowStatus: 'holding',
    source: 'online',
    paymentMethod: 'cod',
    totalAmount: '10000.00',
    codUpfrontAmount: '0.00',
  };

  beforeEach(() => {
    queries = [];
    routing = { creditSellerProceedsIn: jest.fn().mockResolvedValue({ entryId: 1, eventKey: 'ORDER:42:SELLER_PROCEEDS', state: 'ROUTED' }) };
    paymentEvidence = { check: jest.fn().mockResolvedValue({ applicable: false, sufficient: true, purpose: null, requiredMinor: 0, totalMinor: 0 }) };
    dataSource = {
      transaction: async (fn: (m: any) => Promise<any>) => {
        const m = {
          query: jest.fn(async (sql: string, params: any[]) => {
            queries.push({ sql, params });
            if (/^SELECT id, "sellerId"/.test(sql)) return [baseOrderRow];
            if (/^UPDATE "order" SET/.test(sql)) return [{ id: params[0] }];
            return [];
          }),
        };
        return fn(m);
      },
    };
    service = new OrderReleaseService(dataSource, routing, paymentEvidence);
  });

  it('credits the explicit override amount, NOT order.sellerAmount, when amount is provided', async () => {
    // Proves the exact invariant flagged before implementation: the amount
    // actually credited for a COD delivery (sellerAmount minus a handling
    // fee) differs from order.sellerAmount, so it must be passed explicitly
    // rather than trusted to this service's own default derivation.
    const codNetOfFee = 9850.5; // != baseOrderRow.sellerAmount (10000.00)

    await service.releaseSellerProceeds({
      orderId: 42,
      source: 'COD_DELIVERY',
      amount: codNetOfFee,
    });

    expect(routing.creditSellerProceedsIn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orderId: 42, amount: codNetOfFee }),
    );
  });

  it('falls back to order.sellerAmount when no override is given (every existing caller unaffected)', async () => {
    await service.releaseSellerProceeds({ orderId: 42, source: 'ESCROW_RELEASE' });

    expect(routing.creditSellerProceedsIn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orderId: 42, amount: 10000 }),
    );
  });

  it('rounds the override to 2 decimal places the same way the default derivation does', async () => {
    await service.releaseSellerProceeds({ orderId: 42, source: 'COD_DELIVERY', amount: 9850.505 });

    expect(routing.creditSellerProceedsIn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amount: 9850.5 }),
    );
  });

  it('writes COD companion columns (codBalanceCollected etc.) atomically in the SAME release transaction via orderUpdate', async () => {
    const collectedAt = new Date('2026-09-23T12:00:00Z');

    await service.releaseSellerProceeds({
      orderId: 42,
      source: 'COD_DELIVERY',
      amount: 9850.5,
      orderUpdate: {
        paymentStatus: 'paid',
        codBalanceCollected: true,
        codBalanceCollectedByAgentId: 7,
        codBalanceCollectedAt: collectedAt,
      },
    });

    const updateCall = queries.find((q) => /^UPDATE "order" SET/.test(q.sql));
    expect(updateCall).toBeDefined();
    expect(updateCall!.sql).toContain('"codBalanceCollected" = $');
    expect(updateCall!.sql).toContain('"codBalanceCollectedByAgentId" = $');
    expect(updateCall!.sql).toContain('"codBalanceCollectedAt" = $');
    expect(updateCall!.sql).toContain('"paymentStatus" = $');
    expect(updateCall!.params).toEqual(expect.arrayContaining([42, 'paid', true, 7, collectedAt]));
    // Same transaction as the credit — not a separate, uncoordinated write:
    // both the SELECT-for-update and the companion UPDATE ran on the same
    // mocked manager instance inside the one dataSource.transaction(...) call.
    expect(routing.creditSellerProceedsIn).toHaveBeenCalledTimes(1);
  });

  it('rejects an orderUpdate column that is not on the allow-list, exactly as for any other caller', async () => {
    await expect(
      service.releaseSellerProceeds({
        orderId: 42,
        source: 'COD_DELIVERY',
        amount: 9850.5,
        orderUpdate: { sellerAmount: 999999 },
      }),
    ).rejects.toMatchObject({ response: { code: 'RELEASE_COLUMN_NOT_ALLOWED' } });
  });
});
