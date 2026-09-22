import { OrderReleaseService } from './order-release.service';

// resolveOrderRoutingTarget issues its own queries against the manager; this test only cares about
// the evidence gate that runs BEFORE it, so it's stubbed to a fixed resolvable target. The real
// routing/ownership-resolution logic has its own exhaustive coverage in order-release.real-postgres.spec.ts.
jest.mock('./order-routing-target', () => {
  const actual = jest.requireActual('./order-routing-target');
  const { MoneyRoutingTargetType } = jest.requireActual('./entities/money-routing-entry.entity');
  return {
    ...actual,
    resolveOrderRoutingTarget: jest.fn(async () => ({ kind: 'TARGET', targetType: MoneyRoutingTargetType.PERSONAL_USER, userId: 5, workspaceId: null })),
  };
});

/**
 * S0 x I2G integration gate — the wallet-credit backstop (originally S0 Commit 5's
 * WalletService.creditFromEscrowRelease) now lives inside the canonical release operation itself,
 * so every release path gets it uniformly. This is the fast, DB-free unit-test replacement for the
 * old wallet.credit-backstop.spec.ts (which exercised a method removed as part of this integration —
 * see wallet.service.ts's own comment on why). The full routing/wallet-credit success path is
 * covered by order-release.real-postgres.spec.ts; this file isolates just the evidence gate.
 */
describe('OrderReleaseService — payment-evidence backstop', () => {
  let dataSource: any;
  let routing: any;
  let paymentEvidence: any;
  let service: OrderReleaseService;
  let queries: any[];

  const baseOrderRow = {
    id: 10,
    sellerId: 5,
    sellerAmount: '900.00',
    escrowStatus: 'holding',
    source: 'online',
    paymentMethod: 'online',
    totalAmount: '900.00',
    codUpfrontAmount: null,
  };

  beforeEach(() => {
    queries = [];
    routing = { creditSellerProceedsIn: jest.fn() };
    paymentEvidence = { check: jest.fn() };
    dataSource = {
      transaction: async (fn: (m: any) => Promise<any>) => {
        const m = {
          query: jest.fn(async (sql: string, params: any[]) => {
            queries.push(sql);
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

  it('BLOCKS the release — no routing, no credit, no order write — when PaymentEvidence is insufficient for a checkout order', async () => {
    paymentEvidence.check.mockResolvedValue({ applicable: true, sufficient: false, purpose: 'ORDER_FULL', requiredMinor: 90000, totalMinor: 0 });

    await expect(
      service.releaseSellerProceeds({ orderId: 10, source: 'ESCROW_RELEASE' }),
    ).rejects.toMatchObject({ response: { code: 'ORDER_PAYMENT_EVIDENCE_INSUFFICIENT', orderId: 10 } });

    expect(routing.creditSellerProceedsIn).not.toHaveBeenCalled();
    expect(queries.some((q) => /^UPDATE "order" SET/.test(q))).toBe(false);
  });

  it('proceeds to routing when PaymentEvidence is sufficient', async () => {
    paymentEvidence.check.mockResolvedValue({ applicable: true, sufficient: true, purpose: 'ORDER_FULL', requiredMinor: 90000, totalMinor: 90000 });
    routing.creditSellerProceedsIn.mockResolvedValue({ entryId: 1, eventKey: 'ORDER:10:SELLER_PROCEEDS', state: 'ROUTED' });

    const out = await service.releaseSellerProceeds({ orderId: 10, source: 'ESCROW_RELEASE' });

    expect(out).toMatchObject({ released: true, alreadyReleased: false });
    expect(routing.creditSellerProceedsIn).toHaveBeenCalled();
  });

  it('proceeds to routing when PaymentEvidence is not applicable (e.g. a manual/offline order)', async () => {
    paymentEvidence.check.mockResolvedValue({ applicable: false, sufficient: true, purpose: null, requiredMinor: 0, totalMinor: 0 });
    routing.creditSellerProceedsIn.mockResolvedValue({ entryId: 1, eventKey: 'ORDER:10:SELLER_PROCEEDS', state: 'ROUTED' });

    const out = await service.releaseSellerProceeds({ orderId: 10, source: 'ESCROW_RELEASE' });

    expect(out).toMatchObject({ released: true, alreadyReleased: false });
  });

  it('checks evidence using the SAME order fields the checkout-payment chokepoint uses', async () => {
    paymentEvidence.check.mockResolvedValue({ applicable: true, sufficient: true, purpose: 'ORDER_FULL', requiredMinor: 90000, totalMinor: 90000 });
    routing.creditSellerProceedsIn.mockResolvedValue({ entryId: 1, eventKey: 'k', state: 'ROUTED' });

    await service.releaseSellerProceeds({ orderId: 10, source: 'ESCROW_RELEASE' });

    expect(paymentEvidence.check).toHaveBeenCalledWith(
      expect.objectContaining({
        id: baseOrderRow.id,
        source: baseOrderRow.source,
        paymentMethod: baseOrderRow.paymentMethod,
        totalAmount: baseOrderRow.totalAmount,
        codUpfrontAmount: baseOrderRow.codUpfrontAmount,
      }),
    );
  });

  it('an already-released order short-circuits before the evidence check even runs (convergent retry)', async () => {
    dataSource.transaction = async (fn: (m: any) => Promise<any>) => {
      const m = { query: jest.fn(async () => [{ ...baseOrderRow, escrowStatus: 'released' }]) };
      return fn(m);
    };
    const out = await service.releaseSellerProceeds({ orderId: 10, source: 'ESCROW_RELEASE' });
    expect(out).toMatchObject({ released: true, alreadyReleased: true });
    expect(paymentEvidence.check).not.toHaveBeenCalled();
  });
});
