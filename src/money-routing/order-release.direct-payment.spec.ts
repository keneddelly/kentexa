import { OrderReleaseService } from './order-release.service';

/**
 * Release F (MARKETPLACE_PAYMENT_MODE cod_lipa): the buyer pays the seller directly, KenteXa holds
 * no money. Every completion path (buyer confirmation, auto-confirm, handovers, admin) still goes
 * through releaseSellerProceeds; for such an order it must commit only the completion facts and
 * never route money or write escrow/payout/funds-released state.
 */
describe('OrderReleaseService — direct-payment (cod_lipa) orders', () => {
  let routing: any;
  let paymentEvidence: any;
  let queries: Array<{ sql: string; params: any[] }>;
  let service: OrderReleaseService;
  let row: any;

  beforeEach(() => {
    queries = [];
    routing = { creditSellerProceedsIn: jest.fn() };
    paymentEvidence = { check: jest.fn() };
    row = {
      id: 20, sellerId: 5, sellerAmount: '9000.00', escrowStatus: null, source: 'online',
      paymentMethod: 'lipa_namba', totalAmount: '10000.00', codUpfrontAmount: null, paymentMode: 'cod_lipa',
    };
    const dataSource: any = {
      transaction: async (fn: (m: any) => Promise<any>) => fn({
        query: jest.fn(async (sql: string, params: any[]) => {
          queries.push({ sql, params });
          if (/^SELECT id, "sellerId"/.test(sql)) return [row];
          if (/^UPDATE "order" SET/.test(sql)) return [{ id: params[0] }];
          return [];
        }),
      }),
    };
    service = new OrderReleaseService(dataSource, routing, paymentEvidence);
  });

  const updates = () => queries.filter((q) => /^UPDATE "order" SET/.test(q.sql));

  it('commits the completion facts only: no routing, no evidence check, no escrow/payout/funds state', async () => {
    const complete = jest.fn();
    const out = await service.releaseSellerProceeds({
      orderId: 20, source: 'ESCROW_RELEASE', completeInTransaction: complete,
      orderUpdate: { status: 'completed', completedAt: new Date('2026-10-19T10:00:00Z'), paymentStatus: 'released' },
    });

    expect(out).toMatchObject({ released: true, alreadyReleased: false, routing: null, notHeld: true });
    expect(routing.creditSellerProceedsIn).not.toHaveBeenCalled();
    expect(paymentEvidence.check).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalled();
    expect(updates()).toHaveLength(1);
    const sql = updates()[0].sql;
    expect(sql).toContain('"status"');
    expect(sql).toContain('"completedAt"');
    expect(sql).not.toMatch(/escrowStatus|payoutStatus|fundsReleasedAt|paymentStatus/);
  });

  it('a COD (by hand) direct-payment order is treated the same way', async () => {
    row.paymentMethod = 'cod';
    row.codUpfrontAmount = '0.00';
    const out = await service.releaseSellerProceeds({ orderId: 20, source: 'AUTO_RELEASE', orderUpdate: { status: 'completed' } });
    expect(out.notHeld).toBe(true);
    expect(routing.creditSellerProceedsIn).not.toHaveBeenCalled();
  });

  it('with no completion facts it writes nothing at all', async () => {
    await service.releaseSellerProceeds({ orderId: 20, source: 'ADMIN_RELEASE' });
    expect(updates()).toHaveLength(0);
    expect(routing.creditSellerProceedsIn).not.toHaveBeenCalled();
  });

  it('an old order (paymentMode NULL) still takes the normal evidence + routing path', async () => {
    Object.assign(row, { paymentMode: null, paymentMethod: 'online', escrowStatus: 'holding' });
    paymentEvidence.check.mockResolvedValue({ applicable: true, sufficient: false, purpose: 'ORDER_FULL', requiredMinor: 1, totalMinor: 0 });
    await expect(service.releaseSellerProceeds({ orderId: 20, source: 'ESCROW_RELEASE' }))
      .rejects.toMatchObject({ response: { code: 'ORDER_PAYMENT_EVIDENCE_INSUFFICIENT' } });
    expect(paymentEvidence.check).toHaveBeenCalled();
  });
});
