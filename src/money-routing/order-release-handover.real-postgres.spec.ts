import { ReleaseHarness, setupReleaseHarness } from './i2g-release-harness';
import { MoneyRoutingBlockedException } from './order-routing-target';
import { getB5BTestConnectionConfig } from '../business/b5b-closure-test-db';

(getB5BTestConnectionConfig() ? describe : describe.skip)('COD handover joins canonical release transaction', () => {
  jest.setTimeout(120000);
  let h: ReleaseHarness;
  beforeAll(async () => {
    h = await setupReleaseHarness();
    await h.q('CREATE TABLE pickup_marker ("orderId" integer PRIMARY KEY)');
  });
  afterAll(async () => { if (h?.reachable) await h.destroy(); });

  async function order(label: string, blocked = false) {
    const owner = await h.makeUser(label);
    const business = await h.makeBusiness(owner, `${label}-A`, { selling: true });
    return h.makeOrder({ sellerId: owner.id, workspaceId: blocked ? null : business.workspace.id,
      sellerAmount: 1000, source: 'offline_intercity', paymentMethod: 'cod', status: 'ready_for_pickup' });
  }

  it('rolls back routing and release when the physical companion write fails, then retries once', async () => {
    const id = await order('PickupRollback');
    await expect(h.release.releaseSellerProceeds({ orderId: id, source: 'COD_DELIVERY',
      completeInTransaction: async manager => {
        await manager.query('INSERT INTO pickup_marker ("orderId") VALUES ($1)', [id]);
        throw Error('tracking unavailable');
      },
    })).rejects.toThrow('tracking unavailable');
    expect((await h.orderRow(id)).escrowStatus).not.toBe('released');
    expect(await h.ledgerRows(id)).toHaveLength(0);
    expect(await h.q('SELECT * FROM pickup_marker WHERE "orderId"=$1', [id])).toHaveLength(0);

    const completeInTransaction = async (manager: any) => {
      await manager.query('INSERT INTO pickup_marker ("orderId") VALUES ($1)', [id]);
    };
    const results = await Promise.allSettled([
      h.release.releaseSellerProceeds({ orderId: id, source: 'COD_DELIVERY', completeInTransaction }),
      h.release.releaseSellerProceeds({ orderId: id, source: 'COD_DELIVERY', completeInTransaction }),
    ]);
    expect(results.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await h.ledgerRows(id)).toHaveLength(1);
    expect((await h.orderRow(id)).escrowStatus).toBe('released');
    expect(await h.q('SELECT * FROM pickup_marker WHERE "orderId"=$1', [id])).toHaveLength(1);
  });

  it('never runs physical completion when seller routing is blocked', async () => {
    const id = await order('PickupBlocked', true);
    const callback = jest.fn();
    await expect(h.release.releaseSellerProceeds({ orderId: id, source: 'COD_DELIVERY',
      completeInTransaction: callback,
    })).rejects.toBeInstanceOf(MoneyRoutingBlockedException);
    expect(callback).not.toHaveBeenCalled();
    expect(await h.ledgerRows(id)).toHaveLength(0);
    expect((await h.orderRow(id)).escrowStatus).not.toBe('released');
  });
});
