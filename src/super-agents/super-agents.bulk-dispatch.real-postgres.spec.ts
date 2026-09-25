import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../business/b5b-closure-test-db';
import { SuperAgentsService } from './super-agents.service';
import { BulkShipment, BulkShipmentStatus } from './entities/bulk-shipment.entity';
import { Parcel, ParcelStatus, ParcelTracking } from './entities/parcel.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

const config = getB5BTestConnectionConfig();
(config ? describe : describe.skip)('bulk shipment dispatch: PostgreSQL boundary', () => {
  jest.setTimeout(120000);
  let db: DataSource;
  const hub: any = { id: 3, status: 'active', city: 'Dar', businessName: 'Dar Hub' };
  const user: any = { id: 7, name: 'Operator' };
  const context: any = { userId: 7, profileId: 3, roleType: AccountRoleType.SUPER_AGENT };
  const shipment: any = { id: 5, superAgent: hub, lastMileSuperAgent: null,
    lastMileContactName: 'Partner', lastMileContactPhone: null,
    status: BulkShipmentStatus.OPEN, originCity: 'Dar', destinationCity: 'Mwanza', notes: null };

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    db = new DataSource({ type: 'postgres', host: config!.host, port: config!.port,
      username: config!.user, password: config!.password, database: config!.database,
      entities: [], synchronize: false });
    await db.initialize();
    await db.query('CREATE TABLE public.bulk_shipment (id integer PRIMARY KEY, status varchar NOT NULL)');
    await db.query('CREATE TABLE public.parcel (id integer PRIMARY KEY, status varchar NOT NULL, "bulkShipmentId" integer, "destinationCity" varchar)');
    await db.query('CREATE TABLE public.parcel_tracking (id serial PRIMARY KEY, "parcelId" integer NOT NULL, status varchar NOT NULL)');
    await db.query('INSERT INTO public.bulk_shipment (id,status) VALUES (5,$1)', [BulkShipmentStatus.OPEN]);
    await db.query('INSERT INTO public.parcel (id,status,"bulkShipmentId","destinationCity") VALUES (11,$1,5,$2),(12,$1,5,$2)',
      [ParcelStatus.READY_FOR_DISPATCH, 'Mwanza']);
  });
  afterAll(async () => { if (db) await db.destroy(); });

  function build(failSecondTracking = false): any {
    const service: any = Object.create(SuperAgentsService.prototype);
    const readShipment = async () => {
      const [row] = await db.query('SELECT status FROM public.bulk_shipment WHERE id=5');
      return { ...shipment, status: row.status };
    };
    const readParcels = async () => {
      const rows = await db.query('SELECT id,status,"bulkShipmentId","destinationCity" FROM public.parcel WHERE "bulkShipmentId"=5 ORDER BY id');
      return rows.map((row: any) => ({ ...row, superAgent: hub, trackingNumber: `KTX-${row.id}` }));
    };
    service.bulkRepo = { findOne: readShipment };
    service.assertOwnsBulkShipment = async () => hub;
    service.addTrackingEvent = async () => {};
    service.smsService = { sendSms: async () => true };
    service.inAppNotif = { notify: async () => {} };
    service.dataSource = { transaction: (fn: any) => db.transaction(async manager => {
      const proxy: any = Object.create(manager);
      proxy.getRepository = (entity: any): any => {
        if (entity === BulkShipment) return {
          findOne: readShipment,
          update: (_id: number, value: any) => manager.query('UPDATE public.bulk_shipment SET status=$1 WHERE id=5', [value.status]),
        };
        if (entity === Parcel) return {
          find: readParcels,
          update: (id: number, value: any) => manager.query('UPDATE public.parcel SET status=$1 WHERE id=$2', [value.status,id]),
        };
        if (entity === ParcelTracking) return { insert: (value: any) => {
          if (failSecondTracking && value.parcel.id === 12) throw new Error('second tracking insert failed');
          return manager.query('INSERT INTO public.parcel_tracking ("parcelId",status) VALUES ($1,$2)',
            [value.parcel.id,value.status]);
        } };
        throw Error('unexpected repository');
      };
      return fn(proxy);
    }) };
    return service;
  }

  it('rolls back shipment, every parcel and earlier tracking if a later insert fails', async () => {
    await expect(build(true).dispatchBulkShipment(user, 5, {}, context))
      .rejects.toThrow('second tracking insert failed');
    expect((await db.query('SELECT status FROM public.bulk_shipment WHERE id=5'))[0].status).toBe(BulkShipmentStatus.OPEN);
    expect((await db.query('SELECT status FROM public.parcel ORDER BY id')).map((p: any) => p.status))
      .toEqual([ParcelStatus.READY_FOR_DISPATCH, ParcelStatus.READY_FOR_DISPATCH]);
    expect((await db.query('SELECT count(*)::int AS n FROM public.parcel_tracking'))[0].n).toBe(0);
  });

  it('commits the batch once and rejects a replay', async () => {
    await build().dispatchBulkShipment(user, 5, {}, context);
    expect((await db.query('SELECT status FROM public.bulk_shipment WHERE id=5'))[0].status).toBe(BulkShipmentStatus.DISPATCHED);
    expect((await db.query('SELECT status FROM public.parcel ORDER BY id')).map((p: any) => p.status))
      .toEqual([ParcelStatus.DISPATCHED, ParcelStatus.DISPATCHED]);
    expect((await db.query('SELECT count(*)::int AS n FROM public.parcel_tracking'))[0].n).toBe(2);
    await expect(build().dispatchBulkShipment(user, 5, {}, context)).rejects.toThrow('already been dispatched');
    expect((await db.query('SELECT count(*)::int AS n FROM public.parcel_tracking'))[0].n).toBe(2);
  });
});
