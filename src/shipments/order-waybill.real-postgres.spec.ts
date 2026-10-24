import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema, B5B_BASE_ENTITIES } from '../business/b5b-closure-test-db';
import { Shipment } from './entities/shipment.entity';
import { TransportQuote } from '../transport/entities/transport-quote.entity';
import { ProviderAvailability } from '../transport/entities/provider-availability.entity';
import { TransportRoute } from '../transport/entities/transport-route.entity';
import { TransportRun } from '../transport/entities/transport-run.entity';
import { TransportRunStop } from '../transport/entities/transport-run-stop.entity';
import { RouteStop } from '../transport/entities/route-stop.entity';
import { Vehicle } from '../transport/entities/vehicle.entity';
import { JourneyLeg, JourneySelection } from '../transport/entities/journey-selection.entity';
import { ParcelCustodyEvent } from '../super-agents/entities/parcel-custody-event.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { User } from '../users/entities/user.entity';
import { AddShipmentIntakeChannel1788292200000 } from '../database/migrations/1788292200000-AddShipmentIntakeChannel';
import { AddParcelWaybillNumber1791600000000 } from '../database/migrations/1791600000000-AddParcelWaybillNumber';
import { ensureOrderParcel, ensureOrderParcelWithin, needsNetworkParcel } from '../orders/order-parcel';
import { normalizeWaybill } from './waybill';

/**
 * One KenteXa waybill for every order (owner 2026-10-24), real PostgreSQL:
 * the database's own waybill generator (migration 1791600000000) and the
 * real intake Shipment link, on tables carrying the columns the code reads.
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('a marketplace order gets its one KenteXa waybill when it is confirmed', () => {
  let ds: DataSource;
  let seq = 0;
  let seller: any;
  let buyer: any;
  let office: any;
  let otherOffice: any;

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();
    ds = new DataSource({
      type: 'postgres', host: config!.host, port: config!.port, username: config!.user, password: config!.password,
      database: config!.database, synchronize: true, extra: { max: 10 },
      entities: [...B5B_BASE_ENTITIES, ProviderAvailability, TransportRoute, RouteStop, TransportRun, TransportRunStop, Vehicle, Shipment,
        TransportQuote, JourneySelection, JourneyLeg, ParcelCustodyEvent],
    });
    await ds.initialize();
    const runner = ds.createQueryRunner();
    try { await new AddShipmentIntakeChannel1788292200000().up(runner); } finally { await runner.release(); }
    await ds.query(`CREATE TABLE public.product (id SERIAL PRIMARY KEY, name varchar, "productType" varchar DEFAULT 'physical')`);
    await ds.query(`CREATE TABLE public."order" (
      id SERIAL PRIMARY KEY, status varchar, source varchar DEFAULT 'online', "shippingMethod" varchar, "trackingNumber" varchar,
      "sellerId" integer, "buyerId" integer, "productId" integer, "deliveryAddress" varchar, phone varchar,
      "recipientName" varchar, "manualProductName" varchar, "baseAmount" decimal(12,2), "deliveryFeeAmount" decimal(10,2),
      quantity integer DEFAULT 1)`);
    await ds.query(`CREATE TABLE public.parcel (
      id SERIAL PRIMARY KEY, "shipmentId" integer UNIQUE, "orderId" integer, "journeySelectionId" integer,
      "trackingNumber" varchar UNIQUE, status varchar, "senderName" varchar, "senderPhone" varchar,
      "recipientName" varchar, "buyerPhone" varchar, "originCity" varchar, "destinationCity" varchar,
      "deliveryAddress" varchar, "weightKg" decimal(8,2), description text, "estimatedShippingFee" decimal(10,2),
      "actualShippingFee" decimal(10,2), "declaredValue" decimal(12,2), "declaredValueCurrency" varchar(8),
      "superAgentId" integer, "destinationSuperAgentId" integer, "sellerId" integer, "buyerId" integer, source varchar)`);
    // The real waybill generator: KTX + 9 random digits + 1 check digit, unique.
    const waybillRunner = ds.createQueryRunner();
    try { await new AddParcelWaybillNumber1791600000000().up(waybillRunner); } finally { await waybillRunner.release(); }
  });

  afterAll(async () => { if (ds) await ds.destroy().catch(() => {}); });

  const user = (name: string, extra: any = {}) => ds.getRepository(User).save(ds.getRepository(User).create({
    email: `${name}-${++seq}@waybill.local`, phone: `+2557${String(seq).padStart(8, '0')}`, password: 'x', name, ...extra,
  } as any)) as any;
  const hub = async (name: string, extra: any = {}) => {
    const u = await user(`${name}-desk`);
    return ds.getRepository(SuperAgent).save(ds.getRepository(SuperAgent).create({
      userId: u.id, businessName: name, city: 'Dar es Salaam', status: 'active', ...extra,
    } as any) as any) as any;
  };
  const order = async (fields: any = {}) => {
    const [p] = await ds.query(`INSERT INTO public.product (name, "productType") VALUES ($1, $2) RETURNING id`,
      [fields.productName ?? 'Saa ya ukutani', fields.productType ?? 'physical']);
    const [o] = await ds.query(`INSERT INTO public."order" (status, "shippingMethod", "sellerId", "buyerId", "productId",
        "deliveryAddress", phone, "baseAmount", "deliveryFeeAmount")
      VALUES ($1, $2, $3, $4, $5, 'Mbeya, Iyunga', '0712000111', 300000, 8000) RETURNING id`,
      [fields.status ?? 'preparing', fields.shippingMethod ?? 'agent', seller.id, buyer.id, p.id]);
    await ds.query(`UPDATE public."order" SET "trackingNumber" = 'KTX-ORD-' || id WHERE id = $1`, [o.id]);
    return Number(o.id);
  };
  const inTx = <T>(fn: (m: any) => Promise<T>) => ds.manager.transaction(fn);

  beforeEach(async () => {
    for (const t of ['parcel_custody_event', 'parcel', 'shipment', 'journey_leg', 'journey_selection', '"order"', 'product', 'super_agent']) {
      await ds.query(`DELETE FROM public.${t}`);
    }
    seller = await user('BIS', { businessLocation: 'Dar es Salaam, Kariakoo' });
    buyer = await user('Neema');
    office = await hub('Kariakoo Office');
    otherOffice = await hub('Ubungo Office');
  });

  it('a confirmed order gets a Parcel with a real, valid waybill, no office guessed', async () => {
    const id = await order();
    const result = await inTx((m) => ensureOrderParcel(m, id, { actorUserId: seller.id }));
    expect(result).toMatchObject({ created: true, trackingNumber: `KTX-ORD-${id}`, officeId: null });
    expect(normalizeWaybill(result!.waybillNumber)).toBe(result!.waybillNumber); // KTX + 10 digits, check digit right

    const [p] = await ds.query(`SELECT * FROM public.parcel WHERE id = $1`, [result!.parcelId]);
    expect(p).toMatchObject({ status: 'pending', orderId: id, superAgentId: null, originCity: 'Dar es Salaam',
      destinationCity: 'Mbeya', description: 'Saa ya ukutani', source: 'online_order' });
    expect(Number(p.declaredValue)).toBe(300000);
    // Its Shipment waits for an office: the hub decision is written once, with a real office.
    expect(p.shipmentId).toBeNull();
  });

  it('once only: calling again keeps the same parcel and waybill', async () => {
    const id = await order();
    const first = await inTx((m) => ensureOrderParcel(m, id));
    const again = await inTx((m) => ensureOrderParcel(m, id));
    expect(again).toMatchObject({ parcelId: first!.parcelId, waybillNumber: first!.waybillNumber, created: false });
    expect((await ds.query(`SELECT count(*)::int AS n FROM public.parcel WHERE "orderId" = $1`, [id]))[0].n).toBe(1);
  });

  it('every order gets its own waybill', async () => {
    const ids = [await order(), await order(), await order()];
    const waybills = [];
    for (const id of ids) waybills.push((await inTx((m) => ensureOrderParcel(m, id)))!.waybillNumber);
    expect(new Set(waybills).size).toBe(3);
  });

  it('the seller names the office: the parcel is addressed to it, with its Shipment and one hub decision', async () => {
    const id = await order();
    await inTx((m) => ensureOrderParcel(m, id));
    const handed = await inTx((m) => ensureOrderParcel(m, id, { officeId: office.id, actorUserId: seller.id }));
    expect(handed).toMatchObject({ created: false, officeId: office.id });
    const [p] = await ds.query(`SELECT "superAgentId", "shipmentId" FROM public.parcel WHERE "orderId" = $1`, [id]);
    expect(p.superAgentId).toBe(office.id);
    const [s] = await ds.query(`SELECT "originHubId", "originHubSource", "orderId", "intakeChannel", "trackingNumber"
      FROM public.shipment WHERE id = $1`, [p.shipmentId]);
    expect(s).toMatchObject({ originHubId: office.id, originHubSource: 'sender_selected', orderId: id,
      intakeChannel: 'order', trackingNumber: `KTX-ORD-${id}` });

    // Changed mind before handing over: the parcel goes to the other office's list;
    // the Shipment's recorded decision is never rewritten, and there is still one Shipment.
    await inTx((m) => ensureOrderParcel(m, id, { officeId: otherOffice.id }));
    const [moved] = await ds.query(`SELECT "superAgentId", "shipmentId" FROM public.parcel WHERE "orderId" = $1`, [id]);
    expect(moved).toEqual({ superAgentId: otherOffice.id, shipmentId: p.shipmentId });
    expect((await ds.query(`SELECT count(*)::int AS n FROM public.shipment WHERE "orderId" = $1`, [id]))[0].n).toBe(1);
  });

  it('an order handed over straight away gets its parcel and Shipment in one step', async () => {
    const id = await order();
    const r = await inTx((m) => ensureOrderParcel(m, id, { officeId: office.id }));
    expect(r).toMatchObject({ created: true, officeId: office.id });
    const [p] = await ds.query(`SELECT "superAgentId", "shipmentId", "waybillNumber" FROM public.parcel WHERE id = $1`, [r!.parcelId]);
    expect(p.superAgentId).toBe(office.id);
    expect(p.shipmentId).not.toBeNull();
    expect(normalizeWaybill(p.waybillNumber)).toBe(p.waybillNumber);
  });

  it('never moves a parcel an office already holds, and never to an inactive or training office', async () => {
    const id = await order();
    await inTx((m) => ensureOrderParcel(m, id, { officeId: office.id }));
    const training = await hub('Training Office', { isTrainingOffice: true });
    await inTx((m) => ensureOrderParcel(m, id, { officeId: training.id }));
    expect((await ds.query(`SELECT "superAgentId" FROM public.parcel WHERE "orderId" = $1`, [id]))[0].superAgentId).toBe(office.id);

    await ds.query(`UPDATE public.parcel SET status = 'received_at_hub' WHERE "orderId" = $1`, [id]);
    await inTx((m) => ensureOrderParcel(m, id, { officeId: otherOffice.id }));
    expect((await ds.query(`SELECT "superAgentId" FROM public.parcel WHERE "orderId" = $1`, [id]))[0].superAgentId).toBe(office.id);
  });

  it('no parcel for an unpaid order, a digital product or the seller\'s own delivery', async () => {
    const unpaid = await order({ status: 'pending_payment' });
    const digital = await order({ productType: 'digital' });
    const own = await order({ shippingMethod: 'direct' });
    for (const id of [unpaid, digital, own]) expect(await inTx((m) => ensureOrderParcel(m, id))).toBeNull();
    expect((await ds.query(`SELECT count(*)::int AS n FROM public.parcel`))[0].n).toBe(0);
  });

  it('inside a payment: a failure stays inside its savepoint and the payment transaction goes on', async () => {
    const id = await order();
    await ds.query(`ALTER TABLE public.parcel RENAME TO parcel_away`);
    try {
      const outcome = await inTx(async (m) => {
        await m.query(`UPDATE public."order" SET status = 'paid' WHERE id = $1`, [id]);
        const r = await ensureOrderParcelWithin(m, id);
        const [o] = await m.query(`SELECT status FROM public."order" WHERE id = $1`, [id]); // still usable
        return { r, status: o.status };
      });
      expect(outcome).toEqual({ r: null, status: 'paid' });
    } finally {
      await ds.query(`ALTER TABLE public.parcel_away RENAME TO parcel`);
    }
    expect((await ds.query(`SELECT status FROM public."order" WHERE id = $1`, [id]))[0].status).toBe('paid');
  });
});

describe('needsNetworkParcel', () => {
  it('network delivery, confirmed, physical', () => {
    expect(needsNetworkParcel({ shippingMethod: 'agent', status: 'preparing' })).toBe(true);
    expect(needsNetworkParcel({ shippingMethod: 'agent', status: 'paid', productType: 'physical' })).toBe(true);
    expect(needsNetworkParcel({ shippingMethod: 'agent', status: 'pending_payment' })).toBe(false);
    expect(needsNetworkParcel({ shippingMethod: 'agent', status: 'cancelled' })).toBe(false);
    expect(needsNetworkParcel({ shippingMethod: 'direct', status: 'paid' })).toBe(false);
    expect(needsNetworkParcel({ shippingMethod: 'agent', status: 'paid', productType: 'digital' })).toBe(false);
  });
});
