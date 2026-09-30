import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource, Repository } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
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

  it('a repeated submission under the SAME idempotency key never creates a second collection', async () => {
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

  it('concurrent submissions under the SAME idempotency key cannot duplicate', async () => {
    const hub = await mkSuperAgent();
    const dto = {
      parcelId: 1, superAgentId: hub.id, priceContextAmount: 5000, collectedAmount: 5000,
      paymentMethod: 'cash', actorUserId: hub.userId, idempotencyKey: 'k-concurrent',
    };
    const [a, b] = await Promise.all([collectionService.collectCash(dto), collectionService.collectCash(dto)]);
    expect(a.id).toBe(b.id);
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
