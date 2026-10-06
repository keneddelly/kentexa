import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource, Repository } from 'typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { getB5BTestConnectionConfig, resetB5BTestSchema, B5B_BASE_ENTITIES } from '../business/b5b-closure-test-db';
import { SuperAgentCashCollection } from './entities/super-agent-cash-collection.entity';
import { SuperAgentHandlingRate } from './entities/super-agent-handling-rate.entity';
import { SuperAgentHandlingEarning } from './entities/super-agent-handling-earning.entity';
import { ParcelCustodyEvent } from '../super-agents/entities/parcel-custody-event.entity';
import { SuperAgent, SuperAgentStatus } from '../super-agents/entities/super-agent.entity';
import { User } from '../users/entities/user.entity';
import { SuperAgentCashCollectionService } from './super-agent-cash-collection.service';
import { ensureSuperAgentEconomicLedgersImmutable } from './super-agent-commission-schema';
import {
  COD_HANDLING_FEE_PERCENT,
  COD_HANDLING_FEE_KENTEXA_SHARE_PERCENT,
  COD_HANDLING_FEE_AGENT_SHARE_PERCENT,
} from '../cod/cod-policy.config';

const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('Stage 3S-C5 — Super Agent cash-desk collection, real PostgreSQL', () => {
  jest.setTimeout(120000);
  let ds: DataSource;
  let collectionRepo: Repository<SuperAgentCashCollection>;
  let collectionService: SuperAgentCashCollectionService;
  let userSeq = 0;

  const mkSuperAgent = async () => {
    const u = await ds.getRepository(User).save(ds.getRepository(User).create({
      email: `c5-cash-${++userSeq}@s3sc5.local`, phone: `+2554${String(userSeq).padStart(8, '0')}`, password: 'x', name: 'SA',
    } as any));
    return ds.getRepository(SuperAgent).save(ds.getRepository(SuperAgent).create({
      userId: (u as any).id, businessName: 'Hub', city: 'Dar es Salaam', status: SuperAgentStatus.ACTIVE,
    } as any) as unknown as SuperAgent);
  };

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();

    ds = new DataSource({
      type: 'postgres', host: config!.host, port: config!.port, username: config!.user, password: config!.password,
      database: config!.database, synchronize: true, extra: { max: 20 },
      entities: [...B5B_BASE_ENTITIES, ParcelCustodyEvent, SuperAgentHandlingRate, SuperAgentHandlingEarning, SuperAgentCashCollection],
    });
    await ds.initialize();
    await ensureSuperAgentEconomicLedgersImmutable((sql) => ds.query(sql));
    // Bare stub table -- see the commission spec's own identical comment for why.
    await ds.query('CREATE TABLE public.parcel (id integer PRIMARY KEY, "journeySelectionId" integer NULL)');
    await ds.query('INSERT INTO public.parcel VALUES (1)');

    collectionRepo = ds.getRepository(SuperAgentCashCollection);
    collectionService = new SuperAgentCashCollectionService(collectionRepo, ds);
  });

  afterAll(async () => { if (ds) await ds.destroy().catch(() => {}); });

  beforeEach(async () => {
    // TRUNCATE, not DELETE -- the collection ledger's own immutability
    // trigger makes a plain DELETE impossible once any row exists; this is a
    // test-harness-only technique, never used by any production code path.
    await ds.query(`TRUNCATE TABLE public.super_agent_cash_collection RESTART IDENTITY CASCADE`);
    await ds.query(`DELETE FROM public.super_agent`);
    await ds.query(`UPDATE public.parcel SET "journeySelectionId" = NULL`);
    await ds.query(`DROP TABLE IF EXISTS public.journey_leg`);
    await ds.query(`DROP TABLE IF EXISTS public.journey_selection`);
  });

  it('records a cash collection retaining the accepted price context, independent of the actual collected amount', async () => {
    const hub = await mkSuperAgent();
    const row = await collectionService.collectCash({
      parcelId: 1, superAgentId: hub.id, priceContextAmount: 5000, priceContextCurrency: 'TZS',
      collectedAmount: 5000, paymentMethod: 'cash', actorUserId: hub.userId, idempotencyKey: 'k-1',
    });
    expect(Number(row.priceContextAmount)).toBe(5000);
    expect(row.priceContextCurrency).toBe('TZS');
    expect(Number(row.collectedAmount)).toBe(5000);
    expect(row.reconciliationStatus).toBe('pending');
  });

  it('journey-backed cash can be collected only by the frozen first Super Agent custodian, once', async () => {
    const hub = await mkSuperAgent();
    await ds.query(`CREATE TABLE public.journey_selection (
      id integer PRIMARY KEY, status varchar(24), "expectedCashCollectorType" varchar(32),
      "expectedCashCollectionLegSequence" integer)`);
    await ds.query(`CREATE TABLE public.journey_leg (
      id serial PRIMARY KEY, "journeySelectionId" integer, sequence integer, "superAgentId" integer)`);
    await ds.query(`INSERT INTO public.journey_selection
      (id,status,"expectedCashCollectorType","expectedCashCollectionLegSequence")
      VALUES (10,'committed','super_agent',1)`);
    await ds.query(`INSERT INTO public.journey_leg ("journeySelectionId",sequence,"superAgentId")
      VALUES (10,1,$1)`, [hub.id]);
    await ds.query(`UPDATE public.parcel SET "journeySelectionId"=10 WHERE id=1`);

    const dto = {
      parcelId: 1, superAgentId: hub.id, priceContextAmount: 5000, collectedAmount: 5000,
      paymentMethod: 'cash', actorUserId: hub.userId, idempotencyKey: 'journey-once',
    };
    const first = await collectionService.collectCash(dto);
    expect(first.id).toBeDefined();
    await expect(collectionService.collectCash({ ...dto, idempotencyKey: 'journey-second-charge' }))
      .rejects.toThrow(ConflictException);
    expect(await collectionRepo.count()).toBe(1);
  });

  it('rejects a Super Agent that is not the journey-selected cash custodian', async () => {
    const selectedHub = await mkSuperAgent();
    const downstreamHub = await mkSuperAgent();
    await ds.query(`CREATE TABLE public.journey_selection (
      id integer PRIMARY KEY, status varchar(24), "expectedCashCollectorType" varchar(32),
      "expectedCashCollectionLegSequence" integer)`);
    await ds.query(`CREATE TABLE public.journey_leg (
      id serial PRIMARY KEY, "journeySelectionId" integer, sequence integer, "superAgentId" integer)`);
    await ds.query(`INSERT INTO public.journey_selection
      (id,status,"expectedCashCollectorType","expectedCashCollectionLegSequence")
      VALUES (11,'committed','super_agent',1)`);
    await ds.query(`INSERT INTO public.journey_leg ("journeySelectionId",sequence,"superAgentId")
      VALUES (11,1,$1)`, [selectedHub.id]);
    await ds.query(`UPDATE public.parcel SET "journeySelectionId"=11 WHERE id=1`);

    await expect(collectionService.collectCash({
      parcelId: 1, superAgentId: downstreamHub.id, priceContextAmount: 5000, collectedAmount: 5000,
      paymentMethod: 'cash', actorUserId: downstreamHub.userId, idempotencyKey: 'wrong-hub',
    })).rejects.toThrow(ConflictException);
    expect(await collectionRepo.count()).toBe(0);
  });

  it('rejects an unsupported payment method', async () => {
    const hub = await mkSuperAgent();
    await expect(collectionService.collectCash({
      parcelId: 1, superAgentId: hub.id, priceContextAmount: 5000, collectedAmount: 5000,
      paymentMethod: 'mobile_money', actorUserId: hub.userId, idempotencyKey: 'k-2',
    })).rejects.toThrow(BadRequestException);
    expect(await collectionRepo.count()).toBe(0);
  });

  it('rejects a missing/invalid Super Agent identity', async () => {
    await expect(collectionService.collectCash({
      parcelId: 1, superAgentId: 999999, priceContextAmount: 5000, collectedAmount: 5000,
      paymentMethod: 'cash', actorUserId: 1, idempotencyKey: 'k-3',
    })).rejects.toThrow(BadRequestException);
  });

  // ── basic financial validity and reference coherence ────────────────────
  it('rejects a parcelId that does not reference an existing Parcel', async () => {
    const hub = await mkSuperAgent();
    await expect(collectionService.collectCash({
      parcelId: 999999, superAgentId: hub.id, priceContextAmount: 5000, collectedAmount: 5000,
      paymentMethod: 'cash', actorUserId: hub.userId, idempotencyKey: 'k-parcel',
    })).rejects.toThrow(BadRequestException);
    expect(await collectionRepo.count()).toBe(0);
  });

  it('rejects an actorUserId that does not reference an existing user', async () => {
    const hub = await mkSuperAgent();
    await expect(collectionService.collectCash({
      parcelId: 1, superAgentId: hub.id, priceContextAmount: 5000, collectedAmount: 5000,
      paymentMethod: 'cash', actorUserId: 999999, idempotencyKey: 'k-actor-1',
    })).rejects.toThrow(BadRequestException);
  });

  it('rejects an actorUserId that exists but is not authorized to act for the given Super Agent', async () => {
    const hub = await mkSuperAgent();
    const stranger = await mkSuperAgent(); // a real user, just not this hub's own operator
    await expect(collectionService.collectCash({
      parcelId: 1, superAgentId: hub.id, priceContextAmount: 5000, collectedAmount: 5000,
      paymentMethod: 'cash', actorUserId: stranger.userId, idempotencyKey: 'k-actor-2',
    })).rejects.toThrow(BadRequestException);
    expect(await collectionRepo.count()).toBe(0);
  });

  it('rejects a non-positive collected amount and a negative price context', async () => {
    const hub = await mkSuperAgent();
    await expect(collectionService.collectCash({
      parcelId: 1, superAgentId: hub.id, priceContextAmount: 5000, collectedAmount: 0,
      paymentMethod: 'cash', actorUserId: hub.userId, idempotencyKey: 'k-amt-1',
    })).rejects.toThrow(BadRequestException);
    await expect(collectionService.collectCash({
      parcelId: 1, superAgentId: hub.id, priceContextAmount: 5000, collectedAmount: -500,
      paymentMethod: 'cash', actorUserId: hub.userId, idempotencyKey: 'k-amt-2',
    })).rejects.toThrow(BadRequestException);
    await expect(collectionService.collectCash({
      parcelId: 1, superAgentId: hub.id, priceContextAmount: -1, collectedAmount: 5000,
      paymentMethod: 'cash', actorUserId: hub.userId, idempotencyKey: 'k-amt-3',
    })).rejects.toThrow(BadRequestException);
    expect(await collectionRepo.count()).toBe(0);
  });

  it('the DB itself independently enforces positive collected amounts and nonnegative price context', async () => {
    const hub = await mkSuperAgent();
    await expect(ds.query(
      `INSERT INTO public.super_agent_cash_collection
        ("parcelId","superAgentId","priceContextAmount","priceContextCurrency","collectedAmount",currency,"paymentMethod","actorUserId","idempotencyKey")
       VALUES ($1,$2,5000,'TZS',0,'TZS','cash',$3,'k-db-amt-1')`,
      [1, hub.id, hub.userId],
    )).rejects.toThrow();
    await expect(ds.query(
      `INSERT INTO public.super_agent_cash_collection
        ("parcelId","superAgentId","priceContextAmount","priceContextCurrency","collectedAmount",currency,"paymentMethod","actorUserId","idempotencyKey")
       VALUES ($1,$2,-1,'TZS',5000,'TZS','cash',$3,'k-db-amt-2')`,
      [1, hub.id, hub.userId],
    )).rejects.toThrow();
  });

  it('a repeated submission under the SAME idempotency key with the SAME payload never creates a second collection', async () => {
    const hub = await mkSuperAgent();
    const dto = {
      parcelId: 1, superAgentId: hub.id, priceContextAmount: 5000, collectedAmount: 5000,
      paymentMethod: 'cash', actorUserId: hub.userId, idempotencyKey: 'k-retry',
    };
    const first = await collectionService.collectCash(dto);
    const second = await collectionService.collectCash(dto);
    expect(second.id).toBe(first.id);
    expect(await collectionRepo.count()).toBe(1);

    // Independent DB-level backstop.
    await expect(ds.query(
      `INSERT INTO public.super_agent_cash_collection
        ("parcelId","superAgentId","priceContextAmount","priceContextCurrency","collectedAmount",currency,"paymentMethod","actorUserId","idempotencyKey")
       VALUES ($1,$2,5000,'TZS',5000,'TZS','cash',$3,'k-retry')`,
      [1, hub.id, hub.userId],
    )).rejects.toThrow();
  });

  it('concurrent submissions under the SAME idempotency key with the SAME payload cannot duplicate', async () => {
    const hub = await mkSuperAgent();
    const dto = {
      parcelId: 1, superAgentId: hub.id, priceContextAmount: 5000, collectedAmount: 5000,
      paymentMethod: 'cash', actorUserId: hub.userId, idempotencyKey: 'k-concurrent',
    };
    const [a, b] = await Promise.all([collectionService.collectCash(dto), collectionService.collectCash(dto)]);
    expect(a.id).toBe(b.id);
    expect(await collectionRepo.count()).toBe(1);
  });

  // ── a reused key with DIFFERENT economics is a real conflict, never a silent "success" ──
  it('rejects a reused idempotency key whose proposed economics genuinely differ from what was recorded', async () => {
    const hub = await mkSuperAgent();
    const original = {
      parcelId: 1, superAgentId: hub.id, priceContextAmount: 5000, collectedAmount: 5000,
      paymentMethod: 'cash', actorUserId: hub.userId, idempotencyKey: 'k-conflict',
    };
    const first = await collectionService.collectCash(original);

    // Same key, a genuinely different collected amount.
    await expect(collectionService.collectCash({ ...original, collectedAmount: 9999 }))
      .rejects.toThrow(ConflictException);
    // Same key, a genuinely different Super Agent.
    const otherHub = await mkSuperAgent();
    await expect(collectionService.collectCash({ ...original, superAgentId: otherHub.id, actorUserId: otherHub.userId }))
      .rejects.toThrow(ConflictException);

    // Exactly one immutable row exists throughout -- the original, untouched.
    expect(await collectionRepo.count()).toBe(1);
    const reread = await collectionRepo.findOneOrFail({ where: { id: first.id } });
    expect(Number(reread.collectedAmount)).toBe(5000);
    expect(reread.superAgentId).toBe(hub.id);
  });

  it('a genuinely concurrent conflicting request under the SAME key is rejected, not silently reported as the original', async () => {
    const hub = await mkSuperAgent();
    const otherHub = await mkSuperAgent();
    const original = {
      parcelId: 1, superAgentId: hub.id, priceContextAmount: 5000, collectedAmount: 5000,
      paymentMethod: 'cash', actorUserId: hub.userId, idempotencyKey: 'k-concurrent-conflict',
    };
    const conflicting = { ...original, superAgentId: otherHub.id, actorUserId: otherHub.userId, collectedAmount: 1 };

    const results = await Promise.allSettled([
      collectionService.collectCash(original),
      collectionService.collectCash(conflicting),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    // Whichever request actually WON the race committed first; the other,
    // whatever it was, must be rejected as a conflict since the two payloads
    // disagree -- never both "succeeding" and never the loser silently
    // reported as if it were the winner.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(await collectionRepo.count()).toBe(1);
  });

  it('preserves original financial evidence -- the collection ledger is immutable', async () => {
    const hub = await mkSuperAgent();
    const row = await collectionService.collectCash({
      parcelId: 1, superAgentId: hub.id, priceContextAmount: 5000, collectedAmount: 5000,
      paymentMethod: 'cash', actorUserId: hub.userId, idempotencyKey: 'k-immutable',
    });
    await expect(ds.query(`UPDATE public.super_agent_cash_collection SET "collectedAmount" = 1 WHERE id = $1`, [row.id])).rejects.toThrow();
    await expect(ds.query(`DELETE FROM public.super_agent_cash_collection WHERE id = $1`, [row.id])).rejects.toThrow();
  });

  it('a cash collection creates no Super Agent handling earning, and vice versa -- the two ledgers remain independently identifiable', async () => {
    const hub = await mkSuperAgent();
    await collectionService.collectCash({
      parcelId: 1, superAgentId: hub.id, priceContextAmount: 5000, collectedAmount: 5000,
      paymentMethod: 'cash', actorUserId: hub.userId, idempotencyKey: 'k-separation',
    });
    const earningCount = await ds.query(`SELECT count(*)::int AS n FROM public.super_agent_handling_earning`);
    expect(earningCount[0].n).toBe(0);
  });

  // ── the existing Agent COD handling-fee mechanism is untouched ──────────
  it('the existing COD handling-fee configuration is completely unaffected by this gate', () => {
    expect(COD_HANDLING_FEE_PERCENT).toBe(2);
    expect(COD_HANDLING_FEE_KENTEXA_SHARE_PERCENT).toBe(40);
    expect(COD_HANDLING_FEE_AGENT_SHARE_PERCENT).toBe(60);
  });
});
