import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
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
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { AddShipmentIntakeChannel1788292200000 } from '../database/migrations/1788292200000-AddShipmentIntakeChannel';
import { AddParcelWaybillNumber1791600000000 } from '../database/migrations/1791600000000-AddParcelWaybillNumber';
import { AddSuperAgentCommissionFoundation1788287400000 } from '../database/migrations/1788287400000-AddSuperAgentCommissionFoundation';
import { AllowMobileMoneyOfficeCollection1792900000000 } from '../database/migrations/1792900000000-AllowMobileMoneyOfficeCollection';
import { OfficeShipmentPaymentService, officePaymentSms, readOfficePayment } from './office-shipment-payment.service';
import { ensureBatchOrderParcel, mirrorBatchStep, shouldMoveParcel } from '../daily-batches/batch-waybill';
import { BatchParcelStatus } from '../daily-batches/entities/batch-parcel.entity';
import { normalizeWaybill } from './waybill';

/**
 * 2026-10-24, real PostgreSQL:
 *  1. an office records what a sender paid for a send-form shipment, in its own
 *     immutable cash ledger (the real migrations), once per parcel;
 *  2. Dar van-run orders travel on the one KenteXa waybill, each van step moving
 *     the network parcel forward with a tracking line.
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('one waybill: office payments and van runs', () => {
  let ds: DataSource;
  let seq = 0;
  let desk: any; let hub: any; let otherHub: any;
  const sms = { sendSms: jest.fn(async () => true) };
  const events = { record: jest.fn(async () => undefined) };
  const role = () => ({ userId: desk.id, roleType: AccountRoleType.SUPER_AGENT, profileId: hub.id, workspaceId: null } as any);

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
    const run = async (m: any) => { const r = ds.createQueryRunner(); try { await m.up(r); } finally { await r.release(); } };
    await run(new AddShipmentIntakeChannel1788292200000());
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
      "superAgentId" integer, "destinationSuperAgentId" integer, "sellerId" integer, "buyerId" integer, source varchar,
      "createdAt" timestamp NOT NULL DEFAULT now())`);
    await ds.query(`CREATE TABLE public.parcel_tracking (id SERIAL PRIMARY KEY, "parcelId" integer NOT NULL, status text NOT NULL,
      city text, note text, "updatedBy" text, "handlerPhone" text, "handlerLocation" text, "handlerType" text,
      "createdAt" timestamp NOT NULL DEFAULT now())`);
    await ds.query(`CREATE TABLE public.delivery_zone (id SERIAL PRIMARY KEY, name varchar)`);
    await ds.query(`CREATE TABLE public.batch_parcel (id SERIAL PRIMARY KEY, "batchId" integer, "orderId" integer,
      "zoneId" integer, status varchar, "trackingNumber" text)`);
    await run(new AddParcelWaybillNumber1791600000000());
    await run(new AddSuperAgentCommissionFoundation1788287400000()); // the office's real, immutable cash ledger

    const user = (name: string) => ds.getRepository(User).save(ds.getRepository(User).create({
      email: `${name}-${++seq}@pay.local`, phone: `+2557${String(seq).padStart(8, '0')}`, password: 'x', name,
    } as any)) as any;
    desk = await user('Desk');
    hub = await ds.getRepository(SuperAgent).save(ds.getRepository(SuperAgent).create({
      userId: desk.id, businessName: "Ar SAMATTA", city: 'Dar es Salaam', status: 'active',
    } as any) as any);
    const other = await user('Other');
    otherHub = await ds.getRepository(SuperAgent).save(ds.getRepository(SuperAgent).create({
      userId: other.id, businessName: 'MTANDAO', city: 'Dar es Salaam', status: 'active',
    } as any) as any);
  });

  afterAll(async () => { if (ds) await ds.destroy().catch(() => {}); });
  beforeEach(() => { sms.sendSms.mockClear(); events.record.mockClear(); });

  /** A send-form (or other) shipment with its parcel at an office. */
  const shipmentParcel = async (opts: { status?: string; channel?: string; office?: any; price?: number | null } = {}) => {
    const [s] = await ds.query(`INSERT INTO public.shipment ("requestedByUserId", "senderName", "senderPhone", "receiverName",
        "receiverPhone", "originCity", "destinationCity", "itemDescription", "weightKg", "pickupOption", "deliveryOption",
        "priceQuoted", "intakeChannel", status, "trackingNumber")
      VALUES ($1, 'Baraka', '0713000111', 'Neema', '0754000222', 'Dar es Salaam', 'Mbeya', 'Nguo', 2, 'agent', 'agent', $2, $3,
        'confirmed', 'KTX-SHP-' || nextval(pg_get_serial_sequence('public.shipment', 'id'))) RETURNING id`,
    [desk.id, opts.price === undefined ? 12000 : opts.price, opts.channel ?? 'self_service']);
    const [p] = await ds.query(`INSERT INTO public.parcel ("shipmentId", status, "superAgentId", "originCity", "destinationCity", "trackingNumber")
      VALUES ($1, $2, $3, 'Dar es Salaam', 'Mbeya', 'KTX-P-' || $1) RETURNING id, "waybillNumber"`,
    [s.id, opts.status ?? 'received_at_hub', (opts.office ?? hub).id]);
    return { parcelId: Number(p.id), waybill: p.waybillNumber as string };
  };
  const ledger = (parcelId: number) => ds.query(
    `SELECT "superAgentId", "collectedAmount", "priceContextAmount", "paymentMethod", "receiptReference", "actorUserId"
       FROM public.super_agent_cash_collection WHERE "parcelId" = $1`, [parcelId]);

  describe('office payments for send-form shipments', () => {
    it('lists only this office\'s received send-form parcels with no payment yet, with the waybill and the price', async () => {
      const mine = await shipmentParcel();
      const notYet = await shipmentParcel({ status: 'pending' });
      const walkIn = await shipmentParcel({ channel: 'walk_in' });
      const theirs = await shipmentParcel({ office: otherHub });
      const svc = new OfficeShipmentPaymentService(ds, sms as any, events as any);
      const { methods, parcels } = await svc.pending(desk.id, role());
      expect(methods).toEqual(['cash']); // mobile money waits for its migration
      const ids = parcels.map((p) => p.parcelId);
      expect(ids).toContain(mine.parcelId);
      for (const other of [notYet, walkIn, theirs]) expect(ids).not.toContain(other.parcelId);
      expect(parcels.find((p) => p.parcelId === mine.parcelId)).toMatchObject({
        amountDue: 12000, sender: { name: 'Baraka', phone: '0713000111' }, destinationCity: 'Mbeya',
        waybill: expect.stringMatching(/^KTX \d{4} \d{4} \d{2}$/),
      });
    });

    it('records cash once, in the office\'s ledger, and texts the sender a receipt with the waybill', async () => {
      const { parcelId, waybill } = await shipmentParcel();
      const svc = new OfficeShipmentPaymentService(ds, sms as any, events as any);
      const r = await svc.record(desk.id, role(), { parcelId, amount: 12000, method: 'cash' });
      expect(r).toMatchObject({ parcelId, amount: 12000, method: 'cash', replay: false });
      expect(await ledger(parcelId)).toEqual([expect.objectContaining({
        superAgentId: hub.id, paymentMethod: 'cash', actorUserId: desk.id, receiptReference: null,
      })]);
      const [row] = await ledger(parcelId);
      expect([Number(row.collectedAmount), Number(row.priceContextAmount)]).toEqual([12000, 12000]);
      expect(normalizeWaybill(waybill)).toBe(waybill);
      expect(sms.sendSms).toHaveBeenCalledWith('0713000111', expect.stringContaining('tumepokea TZS 12,000 taslimu kwa mzigo KTX '));
      expect(events.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'SHIPMENT_PAYMENT_RECORDED', targetId: parcelId }));
      expect((await svc.pending(desk.id, role())).parcels.map((p) => p.parcelId)).not.toContain(parcelId);
    });

    it('a double tap is one payment; a different second payment is refused', async () => {
      const { parcelId } = await shipmentParcel();
      const svc = new OfficeShipmentPaymentService(ds, sms as any, events as any);
      await svc.record(desk.id, role(), { parcelId, amount: 10000, method: 'cash' });
      await expect(svc.record(desk.id, role(), { parcelId, amount: 10000, method: 'cash' })).resolves.toMatchObject({ replay: true });
      await expect(svc.record(desk.id, role(), { parcelId, amount: 15000, method: 'cash' })).rejects.toBeInstanceOf(ConflictException);
      expect(await ledger(parcelId)).toHaveLength(1);
      expect(sms.sendSms).toHaveBeenCalledTimes(1);
    });

    it('only the office holding a received send-form parcel, as its own operator', async () => {
      const svc = new OfficeShipmentPaymentService(ds, sms as any, events as any);
      const theirs = await shipmentParcel({ office: otherHub });
      await expect(svc.record(desk.id, role(), { parcelId: theirs.parcelId, amount: 5000 })).rejects.toBeInstanceOf(ForbiddenException);
      const notYet = await shipmentParcel({ status: 'pending' });
      await expect(svc.record(desk.id, role(), { parcelId: notYet.parcelId, amount: 5000 })).rejects.toThrow('Pokea mzigo kwanza');
      const walkIn = await shipmentParcel({ channel: 'walk_in' });
      await expect(svc.record(desk.id, role(), { parcelId: walkIn.parcelId, amount: 5000 })).rejects.toBeInstanceOf(BadRequestException);
      const mine = await shipmentParcel();
      await expect(svc.record(desk.id, { ...role(), roleType: AccountRoleType.SELLER }, { parcelId: mine.parcelId, amount: 5000 }))
        .rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.record(desk.id, role(), { parcelId: mine.parcelId, amount: 0 })).rejects.toThrow('Weka kiasi');
      expect(await ledger(mine.parcelId)).toHaveLength(0);
    });

    it('mobile money: refused until migration 1792900000000, then recorded with its reference', async () => {
      const before = await shipmentParcel();
      await expect(new OfficeShipmentPaymentService(ds, sms as any).record(desk.id, role(),
        { parcelId: before.parcelId, amount: 12000, method: 'mobile_money' })).rejects.toThrow('Chagua njia ya malipo');

      const r = ds.createQueryRunner();
      try { await new AllowMobileMoneyOfficeCollection1792900000000().up(r); } finally { await r.release(); }
      const svc = new OfficeShipmentPaymentService(ds, sms as any); // fresh: re-reads the ledger rule
      expect(await svc.methods()).toEqual(['cash', 'mobile_money']);
      await svc.record(desk.id, role(), { parcelId: before.parcelId, amount: 12000, method: 'mobile_money', reference: ' QJK8X2 ' });
      expect(await ledger(before.parcelId)).toEqual([expect.objectContaining({ paymentMethod: 'mobile_money', receiptReference: 'QJK8X2' })]);
      expect(sms.sendSms).toHaveBeenCalledWith('0713000111', expect.stringContaining('kwa mobile money'));
    });
  });

  describe('Dar van runs on the one waybill', () => {
    const vanOrder = async (zoneId: number, batchId = 1) => {
      const [p] = await ds.query(`INSERT INTO public.product (name) VALUES ('Kiatu') RETURNING id`);
      const [o] = await ds.query(`INSERT INTO public."order" (status, "shippingMethod", "sellerId", "buyerId", "productId",
          "deliveryAddress", "baseAmount") VALUES ('preparing', 'kentexa_delivery', $1, $1, $2, 'Sinza, Dar es Salaam', 40000) RETURNING id`,
      [desk.id, p.id]);
      await ds.query(`UPDATE public."order" SET "trackingNumber" = 'KTX-ORD-' || id WHERE id = $1`, [o.id]);
      const [bp] = await ds.query(`INSERT INTO public.batch_parcel ("batchId", "orderId", "zoneId", status, "trackingNumber")
        VALUES ($1, $2, $3, 'awaiting_handover', 'KTX-ORD-' || $2) RETURNING id`, [batchId, o.id, zoneId]);
      return { orderId: Number(o.id), batchParcelId: Number(bp.id) };
    };
    const parcelOf = async (orderId: number) => (await ds.query(
      `SELECT id, status, "waybillNumber", "trackingNumber" FROM public.parcel WHERE "orderId" = $1`, [orderId]))[0];
    const history = async (parcelId: number) => (await ds.query(
      `SELECT status, city FROM public.parcel_tracking WHERE "parcelId" = $1 ORDER BY id`, [parcelId]));

    it('a van-run order gets its network parcel and waybill, and every van step moves it forward with a tracking line', async () => {
      const [sinza] = await ds.query(`INSERT INTO public.delivery_zone (name) VALUES ('Sinza') RETURNING id`);
      const [mbezi] = await ds.query(`INSERT INTO public.delivery_zone (name) VALUES ('Mbezi') RETURNING id`);
      const a = await vanOrder(sinza.id, 7);
      const b = await vanOrder(mbezi.id, 7);
      for (const o of [a, b]) {
        const r = await ensureBatchOrderParcel(ds.manager, o.orderId);
        expect(normalizeWaybill(r!.waybillNumber)).toBe(r!.waybillNumber);
        expect(r!.trackingNumber).toBe(`KTX-ORD-${o.orderId}`); // the same one number as the order and the van parcel
      }
      const pa = await parcelOf(a.orderId);
      expect(pa.status).toBe('pending');

      expect(await mirrorBatchStep(ds.manager, { batchParcelId: a.batchParcelId }, BatchParcelStatus.AT_HUB)).toBe(1);
      expect((await parcelOf(a.orderId)).status).toBe('received_at_hub');
      expect(await mirrorBatchStep(ds.manager, { batchId: 7 }, BatchParcelStatus.ON_VAN)).toBe(2);
      expect(await mirrorBatchStep(ds.manager, { batchId: 7, zoneId: sinza.id }, BatchParcelStatus.AT_ZONE)).toBe(1);
      expect((await parcelOf(b.orderId)).status).toBe('in_transit'); // the other zone is not there yet
      await mirrorBatchStep(ds.manager, { batchParcelId: a.batchParcelId }, BatchParcelStatus.DELIVERED);
      // A late or repeated step never moves a finished parcel back.
      expect(await mirrorBatchStep(ds.manager, { batchParcelId: a.batchParcelId }, BatchParcelStatus.AT_HUB)).toBe(0);

      expect((await parcelOf(a.orderId)).status).toBe('delivered');
      expect(await history(pa.id)).toEqual([
        { status: 'received_at_hub', city: 'Kariakoo' },
        { status: 'in_transit', city: 'Sinza' },
        { status: 'arrived_at_hub', city: 'Sinza' },
        { status: 'delivered', city: 'Sinza' },
      ]);
    });

    it('a van step never fails because of the waybill mirror', async () => {
      await ds.query(`ALTER TABLE public.parcel_tracking RENAME TO parcel_tracking_away`);
      try {
        const [z] = await ds.query(`INSERT INTO public.delivery_zone (name) VALUES ('Kimara') RETURNING id`);
        const o = await vanOrder(z.id, 9);
        await ensureBatchOrderParcel(ds.manager, o.orderId);
        await expect(mirrorBatchStep(ds.manager, { batchParcelId: o.batchParcelId }, BatchParcelStatus.AT_HUB)).resolves.toBe(0);
        expect((await parcelOf(o.orderId)).status).toBe('pending'); // nothing half-written
      } finally {
        await ds.query(`ALTER TABLE public.parcel_tracking_away RENAME TO parcel_tracking`);
      }
    });
  });
});

describe('pure helpers', () => {
  it('reads what the office typed', () => {
    expect(readOfficePayment({ amount: '12000', method: 'cash' }, ['cash'])).toEqual({ amount: 12000, method: 'cash', reference: null });
    expect(() => readOfficePayment({ amount: 0 }, ['cash'])).toThrow('badAmount');
    expect(() => readOfficePayment({ amount: 5000, method: 'mobile_money' }, ['cash'])).toThrow('badMethod');
    expect(() => readOfficePayment({ amount: 5000, method: 'card' }, ['cash', 'mobile_money'])).toThrow('badMethod');
  });

  it('the receipt SMS is one plain part', () => {
    const text = officePaymentSms({ officeName: 'Ar SAMATTA’s Office 🚚', amount: 12000, method: 'cash', number: 'KTX 4829 1037 52' });
    expect(text).toBe("Ar SAMATTA s Office: tumepokea TZS 12,000 taslimu kwa mzigo KTX 4829 1037 52. Asante.");
    expect(text.length).toBeLessThanOrEqual(160);
  });

  it('van steps only move a parcel forward', () => {
    expect(shouldMoveParcel('pending', 'received_at_hub')).toBe(true);
    expect(shouldMoveParcel('in_transit', 'received_at_hub')).toBe(false);
    expect(shouldMoveParcel('delivered', 'returned')).toBe(false);
    expect(shouldMoveParcel('arrived_at_hub', null)).toBe(false);
  });
});
