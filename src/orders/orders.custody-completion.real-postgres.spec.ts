import 'reflect-metadata';
import { getB5BTestConnectionConfig } from '../business/b5b-closure-test-db';
import { setupReleaseHarness, ReleaseHarness } from '../money-routing/i2g-release-harness';
import { AddParcelCustodyEvent1788278400000 } from '../database/migrations/1788278400000-AddParcelCustodyEvent';
import { AddParcelPickupChallenge1788279000000 } from '../database/migrations/1788279000000-AddParcelPickupChallenge';
import { OrdersService } from './orders.service';
import { Order } from './entities/order.entity';

(getB5BTestConnectionConfig() ? describe : describe.skip)('Order release cannot overrule Parcel custody', () => {
  jest.setTimeout(120000);
  let h: ReleaseHarness;
  const service: any = Object.create(OrdersService.prototype);

  beforeAll(async () => {
    h = await setupReleaseHarness();
    await h.q(`CREATE TABLE public.parcel (id serial PRIMARY KEY, "trackingNumber" varchar UNIQUE,
      "orderId" integer REFERENCES public."order"(id), status varchar NOT NULL,
      "buyerRequestedDelivery" boolean)`);
    const runner = h.ds.createQueryRunner();
    try {
      await new AddParcelCustodyEvent1788278400000().up(runner);
      await new AddParcelPickupChallenge1788279000000().up(runner);
    } finally { await runner.release(); }
  });
  afterAll(async () => { if (h?.reachable) await h.destroy(); });

  async function create(label: string, status: string, requested: boolean | null, custody?: string) {
    const owner = await h.makeUser(label);
    const business = await h.makeBusiness(owner, `${label} Business`, { selling: true });
    const id = await h.makeOrder({ sellerId: owner.id, workspaceId: business.workspace.id,
      sellerAmount: 1000, source: 'offline_intercity', paymentMethod: 'online', status: 'in_transit' });
    const tracking = `KTX-${label}-${id}`;
    await h.q('UPDATE public."order" SET "trackingNumber"=$2 WHERE id=$1', [id, tracking]);
    const [p] = await h.q(`INSERT INTO public.parcel ("trackingNumber","orderId",status,"buyerRequestedDelivery")
      VALUES ($1,$2,$3,$4) RETURNING id`, [tracking, id, status, requested]);
    if (custody) await h.q(`INSERT INTO public.parcel_custody_event
      ("parcelId","eventKind","operationKey","toCustodianType","toCustodianId",
       "actorSource","actorUserId","actorAccountRoleId","actorRoleType")
      VALUES ($1,$2,$3,$4,$5,'account_role',$6,17,'super_agent')`,
      [p.id, custody, `${custody}:${id}`,
        custody === 'recipient_self_pickup' ? 'recipient_contact' : 'super_agent',
        custody === 'recipient_self_pickup' ? null : 6, owner.id]);
    return { id, tracking };
  }

  async function release(o: { id: number; tracking: string }) {
    return h.release.releaseSellerProceeds({ orderId: o.id, source: 'ESCROW_RELEASE',
      completeInTransaction: manager => service.assertLinkedParcelCustodyAllowsOrderCompletion(
        { id: o.id, trackingNumber: o.tracking } as Order, manager),
    });
  }

  it('rolls back seller credit for a hub-held Parcel and a selected Agent without receipt', async () => {
    for (const [label, status, requested, custody] of [
      ['HubHeld', 'awaiting_buyer', null, 'destination_hub_received'],
      ['AgentSelected', 'arrived_at_hub', true, undefined],
    ] as const) {
      const o = await create(label, status, requested, custody);
      await expect(release(o)).rejects.toThrow('Physical recipient handover is not verified');
      expect((await h.orderRow(o.id)).escrowStatus).not.toBe('released');
      expect(await h.ledgerRows(o.id)).toHaveLength(0);
    }
  });

  it('allows a verified terminal recipient event and keeps historical no-custody flow', async () => {
    const verified = await create('Recipient', 'self_pickup', false, 'recipient_self_pickup');
    await release(verified);
    expect((await h.orderRow(verified.id)).escrowStatus).toBe('released');
    expect(await h.ledgerRows(verified.id)).toHaveLength(1);
    const legacy = await create('Legacy', 'in_transit', null);
    await release(legacy);
    expect((await h.orderRow(legacy.id)).escrowStatus).toBe('released');
  });
});
