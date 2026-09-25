import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../business/b5b-closure-test-db';
import { SuperAgentsService } from './super-agents.service';
import { Parcel, ParcelStatus, ParcelTracking } from './entities/parcel.entity';
import { TransportAssignment } from '../transport/entities/transport-assignment.entity';

const config = getB5BTestConnectionConfig();
(config ? describe : describe.skip)('single parcel dispatch: PostgreSQL commit and rollback', () => {
  jest.setTimeout(120000);
  let db: DataSource;
  const user: any = { id: 7, name: 'Hub operator' };
  const hub: any = { id: 3, city: 'Dar', businessName: 'Dar Hub' };
  const parcel: any = { id: 31, trackingNumber: 'KTX-31', superAgent: hub,
    destinationCity: 'Mwanza', buyerPhone: null, order: null,
    shipment: null, bulkShipmentId: null };

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    db = new DataSource({ type: 'postgres', host: config!.host, port: config!.port,
      username: config!.user, password: config!.password, database: config!.database,
      entities: [], synchronize: false });
    await db.initialize();
    await db.query('CREATE TABLE public.parcel (id integer PRIMARY KEY, status varchar NOT NULL, "bulkShipmentId" integer)');
    await db.query('CREATE TABLE public.transport_assignment (id integer PRIMARY KEY, "parcelRefId" integer, "parcelId" integer, "trackingNumber" varchar)');
    await db.query('CREATE TABLE public.parcel_tracking (id serial PRIMARY KEY, "parcelId" integer, status varchar NOT NULL)');
    await db.query('INSERT INTO public.parcel (id,status) VALUES (31,$1)', [ParcelStatus.RECEIVED_AT_HUB]);
    await db.query('INSERT INTO public.transport_assignment (id) VALUES (17)');
  });
  afterAll(async () => { if (db) await db.destroy(); });

  function build(failTracking = false): any {
    const service: any = Object.create(SuperAgentsService.prototype);
    const readParcel = async () => {
      const [row] = await db.query('SELECT status,"bulkShipmentId" FROM public.parcel WHERE id=31');
      return { ...parcel, ...row };
    };
    service.parcelRepo = { findOne: readParcel };
    service.assertOwnsParcel = async () => hub;
    service.addTrackingEvent = async () => {};
    service.auditLog = { record: async () => {} };
    service.smsService = { sendSms: async () => true };
    service.transportAssignmentRepo = { findOne: async () => ({ id: 17,
      assignedById: 7, status: 'accepted', parcelId: null, parcelRefId: null,
      shipmentId: null, trackingNumber: null, provider: { name: 'Carrier' } }) };
    service.dataSource = { transaction: (fn: any) => db.transaction(async manager => {
      const proxy: any = Object.create(manager);
      proxy.getRepository = (entity: any): any => {
        if (entity === Parcel) return {
          findOne: readParcel,
          update: (_id: number, updates: any) => manager.query('UPDATE public.parcel SET status=$1 WHERE id=31', [updates.status]),
        };
        if (entity === TransportAssignment) return {
          findOne: async () => ({ id: 17, assignedById: 7, status: 'accepted', parcelId: null,
            parcelRefId: null, shipmentId: null, trackingNumber: null }),
          update: (_id: number, value: any) => manager.query('UPDATE public.transport_assignment SET "parcelRefId"=$1,"parcelId"=$2,"trackingNumber"=$3 WHERE id=17',
            [value.parcelRefId, value.parcelId, value.trackingNumber]),
        };
        if (entity === ParcelTracking) return { insert: (value: any) => {
          if (failTracking) throw new Error('tracking insert failed');
          return manager.query('INSERT INTO public.parcel_tracking ("parcelId",status) VALUES ($1,$2)', [value.parcel.id,value.status]);
        } };
        throw Error('unexpected repository');
      };
      return fn(proxy);
    }) };
    return service;
  }

  it('rolls back parcel and assignment when tracking insert fails', async () => {
    await expect(build(true).dispatchParcel(user, 'KTX-31', { transportAssignmentId: 17 }))
      .rejects.toThrow('tracking insert failed');
    expect((await db.query('SELECT status FROM public.parcel WHERE id=31'))[0].status).toBe(ParcelStatus.RECEIVED_AT_HUB);
    expect((await db.query('SELECT "parcelRefId" FROM public.transport_assignment WHERE id=17'))[0].parcelRefId).toBeNull();
    expect((await db.query('SELECT count(*)::int AS n FROM public.parcel_tracking'))[0].n).toBe(0);
  });

  it('commits once and rejects a replay without another tracking record', async () => {
    await build().dispatchParcel(user, 'KTX-31', { transportAssignmentId: 17 });
    expect((await db.query('SELECT status FROM public.parcel WHERE id=31'))[0].status).toBe(ParcelStatus.DISPATCHED);
    expect((await db.query('SELECT "parcelRefId" FROM public.transport_assignment WHERE id=17'))[0].parcelRefId).toBe(31);
    expect((await db.query('SELECT count(*)::int AS n FROM public.parcel_tracking'))[0].n).toBe(1);
    await expect(build().dispatchParcel(user, 'KTX-31', {})).rejects.toThrow('outside a bulk shipment');
    expect((await db.query('SELECT count(*)::int AS n FROM public.parcel_tracking'))[0].n).toBe(1);
  });
});
