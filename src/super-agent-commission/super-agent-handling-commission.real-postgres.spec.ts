import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource, Repository } from 'typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { getB5BTestConnectionConfig, resetB5BTestSchema, B5B_BASE_ENTITIES } from '../business/b5b-closure-test-db';
import { SuperAgentHandlingRate } from './entities/super-agent-handling-rate.entity';
import { SuperAgentHandlingEarning } from './entities/super-agent-handling-earning.entity';
import { SuperAgentCashCollection } from './entities/super-agent-cash-collection.entity';
import { ParcelCustodyEvent } from '../super-agents/entities/parcel-custody-event.entity';
import { SuperAgent, SuperAgentStatus } from '../super-agents/entities/super-agent.entity';
import { User } from '../users/entities/user.entity';
import { SuperAgentHandlingRateService } from './super-agent-handling-rate.service';
import { SuperAgentHandlingEarningService } from './super-agent-handling-earning.service';
import {
  ensureSuperAgentHandlingRateNoOverlapConstraint,
  ensureSuperAgentEconomicLedgersImmutable,
} from './super-agent-commission-schema';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityEvent, ActivityCategory } from '../activity/entities/activity-event.entity';

/**
 * Stage 3S-C5 — Super Agent handling commission: rate configuration +
 * eligibility + earning creation, proved against REAL PostgreSQL. The
 * central invariant: "No qualifying canonical ParcelCustodyEvent -> no
 * Super Agent handling earning."
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('Stage 3S-C5 — Super Agent handling commission, real PostgreSQL', () => {
  jest.setTimeout(120000);
  let ds: DataSource;
  let rateRepo: Repository<SuperAgentHandlingRate>;
  let earningRepo: Repository<SuperAgentHandlingEarning>;
  let custodyRepo: Repository<ParcelCustodyEvent>;
  let rateService: SuperAgentHandlingRateService;
  let earningService: SuperAgentHandlingEarningService;
  let activityEventService: ActivityEventService;
  let activityEventRepo: Repository<ActivityEvent>;
  let userSeq = 0;
  let opKeySeq = 0;

  const mkSuperAgent = async () => {
    const u = await ds.getRepository(User).save(ds.getRepository(User).create({
      email: `c5-sa-${++userSeq}@s3sc5.local`, phone: `+2559${String(userSeq).padStart(8, '0')}`, password: 'x', name: 'SA',
    } as any));
    return ds.getRepository(SuperAgent).save(ds.getRepository(SuperAgent).create({
      userId: (u as any).id, businessName: 'Hub', city: 'Dar es Salaam', status: SuperAgentStatus.ACTIVE,
    } as any) as unknown as SuperAgent);
  };

  // actorSource defaults to 'provider_webhook' -- a REAL, authenticated
  // actor -- not 'system' (this ledger's own vocabulary for "no identifiable
  // actor at all"). A dedicated test below explicitly proves a 'system'
  // actor is rejected even when custodian direction looks otherwise correct.
  const mkCustodyEvent = (o: Partial<{
    parcelId: number; eventKind: string; fromCustodianType: string | null; fromCustodianId: number | null;
    toCustodianType: string | null; toCustodianId: number | null; recordedAt: Date; actorSource: string;
    evidenceRef: string | null;
  }> = {}) => custodyRepo.save(custodyRepo.create({
    parcelId: o.parcelId ?? 1,
    eventKind: o.eventKind ?? 'origin_hub_received',
    operationKey: `c5-op-${++opKeySeq}`,
    fromCustodianType: o.fromCustodianType ?? null,
    fromCustodianId: o.fromCustodianId ?? null,
    toCustodianType: o.toCustodianType ?? null,
    toCustodianId: o.toCustodianId ?? null,
    actorSource: o.actorSource ?? 'provider_webhook',
    assignmentType: null,
    evidenceRef: o.evidenceRef ?? null,
    ...(o.recordedAt ? { recordedAt: o.recordedAt } : {}),
  } as any) as unknown as ParcelCustodyEvent);

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();

    ds = new DataSource({
      type: 'postgres', host: config!.host, port: config!.port, username: config!.user, password: config!.password,
      database: config!.database, synchronize: true, extra: { max: 20 },
      entities: [...B5B_BASE_ENTITIES, ParcelCustodyEvent, SuperAgentHandlingRate, SuperAgentHandlingEarning, SuperAgentCashCollection, ActivityEvent],
    });
    await ds.initialize();
    await ensureSuperAgentHandlingRateNoOverlapConstraint((sql) => ds.query(sql));
    await ensureSuperAgentEconomicLedgersImmutable((sql) => ds.query(sql));
    // Bare stub table -- assertParcelExists only ever needs "does this
    // parcelId exist", never the real Parcel entity's own relation graph
    // (mirrors ParcelRunAssignmentService's own established convention).
    await ds.query('CREATE TABLE public.parcel (id integer PRIMARY KEY)');
    await ds.query('INSERT INTO public.parcel VALUES (1),(42),(43)');

    rateRepo = ds.getRepository(SuperAgentHandlingRate);
    earningRepo = ds.getRepository(SuperAgentHandlingEarning);
    custodyRepo = ds.getRepository(ParcelCustodyEvent);
    activityEventRepo = ds.getRepository(ActivityEvent);
    activityEventService = new ActivityEventService(activityEventRepo);

    rateService = new SuperAgentHandlingRateService(rateRepo, earningRepo);
    earningService = new SuperAgentHandlingEarningService(custodyRepo, earningRepo, rateService, ds, activityEventService);
  });

  afterAll(async () => { if (ds) await ds.destroy().catch(() => {}); });

  beforeEach(async () => {
    // TRUNCATE, not DELETE -- the earning ledger's own immutability trigger
    // (BEFORE UPDATE OR DELETE) makes a plain DELETE impossible once any row
    // exists; TRUNCATE is a test-harness-only technique, never used by any
    // production code path. CASCADE clears its FK dependents so the
    // subsequent DELETEs on its parent tables are never blocked.
    await ds.query(`TRUNCATE TABLE public.super_agent_handling_earning RESTART IDENTITY CASCADE`);
    await ds.query(`DELETE FROM public.super_agent_handling_rate`);
    await ds.query(`DELETE FROM public.parcel_custody_event`);
    await ds.query(`DELETE FROM public.super_agent`);
    await ds.query(`DELETE FROM public.activity_events`);
  });

  // ── rate configuration ──────────────────────────────────────────────────
  it('the initial pilot configuration is data-driven -- reading it never touches a hard-coded constant', async () => {
    await rateService.configureRate({
      commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 1000), createdByUserId: null,
    });
    const rate = await rateService.getEffectiveRate('handling', 'global', new Date());
    expect(rate).not.toBeNull();
    expect(Number(rate!.amount)).toBe(500);
    expect(rate!.currency).toBe('TZS');
  });

  it('effective-dated rate selection resolves the correct version at different points in time', async () => {
    await rateService.configureRate({
      commissionType: 'handling', amount: 500,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'), effectiveTo: new Date('2026-06-01T00:00:00Z'),
      createdByUserId: 1,
    });
    await rateService.configureRate({
      commissionType: 'handling', amount: 700,
      effectiveFrom: new Date('2026-06-01T00:00:00Z'), createdByUserId: 1,
    });
    expect(Number((await rateService.getEffectiveRate('handling', 'global', new Date('2026-03-01T00:00:00Z')))!.amount)).toBe(500);
    expect(Number((await rateService.getEffectiveRate('handling', 'global', new Date('2026-08-01T00:00:00Z')))!.amount)).toBe(700);
    expect(await rateService.getEffectiveRate('handling', 'global', new Date('2025-01-01T00:00:00Z'))).toBeNull();
  });

  it('rejects a non-positive amount and an invalid (to before from) effective window', async () => {
    await expect(rateService.configureRate({
      commissionType: 'handling', amount: 0, effectiveFrom: new Date('2026-01-01T00:00:00Z'), createdByUserId: 1,
    })).rejects.toThrow();
    await expect(rateService.configureRate({
      commissionType: 'handling', amount: -500, effectiveFrom: new Date('2026-01-01T00:00:00Z'), createdByUserId: 1,
    })).rejects.toThrow();
    await expect(rateService.configureRate({
      commissionType: 'handling', amount: 500,
      effectiveFrom: new Date('2026-06-01T00:00:00Z'), effectiveTo: new Date('2026-01-01T00:00:00Z'),
      createdByUserId: 1,
    })).rejects.toThrow();
  });

  it('rejects an overlapping active configuration for the same commission type/scope', async () => {
    await rateService.configureRate({
      commissionType: 'handling', amount: 500, effectiveFrom: new Date('2026-01-01T00:00:00Z'), createdByUserId: 1,
    });
    await expect(rateService.configureRate({
      commissionType: 'handling', amount: 600, effectiveFrom: new Date('2026-03-01T00:00:00Z'), createdByUserId: 1,
    })).rejects.toThrow(ConflictException);
    // A DIFFERENT scope is unaffected.
    await expect(rateService.configureRate({
      commissionType: 'handling', scope: 'regionA', amount: 600, effectiveFrom: new Date('2026-03-01T00:00:00Z'), createdByUserId: 1,
    })).resolves.toBeDefined();
  });

  // ── retraction is limited to still-future, not-yet-effective drafts ────────
  it('deactivating a still-future draft frees its own window for a corrected replacement', async () => {
    const draft = await rateService.configureRate({
      commissionType: 'handling', amount: 999, effectiveFrom: new Date('2030-01-01T00:00:00Z'), createdByUserId: 1,
    });
    await rateService.deactivateRate(draft.id);
    await expect(rateService.configureRate({
      commissionType: 'handling', amount: 700, effectiveFrom: new Date('2030-01-01T00:00:00Z'), createdByUserId: 1,
    })).resolves.toBeDefined();
    expect(await rateService.getEffectiveRate('handling', 'global', new Date('2030-06-01T00:00:00Z'))).toMatchObject({ amount: '700.00' });
  });

  it('rejects retracting an already-PAST configuration', async () => {
    const past = await rateService.configureRate({
      commissionType: 'handling', amount: 500,
      effectiveFrom: new Date('2020-01-01T00:00:00Z'), effectiveTo: new Date('2020-06-01T00:00:00Z'),
      createdByUserId: 1,
    });
    await expect(rateService.deactivateRate(past.id)).rejects.toThrow(ConflictException);
    // Unchanged -- still readable at its own past window.
    expect(await rateService.getEffectiveRate('handling', 'global', new Date('2020-03-01T00:00:00Z'))).toMatchObject({ amount: '500.00' });
  });

  it('rejects retracting a CURRENTLY ACTIVE (in-effect right now) configuration', async () => {
    const active = await rateService.configureRate({
      commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 1000), createdByUserId: 1,
    });
    await expect(rateService.deactivateRate(active.id)).rejects.toThrow(ConflictException);
    expect(await rateService.getEffectiveRate('handling', 'global', new Date())).toMatchObject({ amount: '500.00' });
  });

  it('rejects retracting a configuration already referenced by a recorded earning, even one whose effectiveFrom is technically future', async () => {
    // Contrived on purpose -- this should never legitimately happen (nothing
    // is recorded against a rate before its own effectiveFrom), but the
    // review specifically asked this be defended regardless.
    const future = await rateService.configureRate({
      commissionType: 'handling', amount: 500, effectiveFrom: new Date('2030-01-01T00:00:00Z'), createdByUserId: 1,
    });
    const hub = await mkSuperAgent();
    const event = await mkCustodyEvent({ toCustodianType: 'super_agent', toCustodianId: hub.id });
    await earningRepo.save(earningRepo.create({
      custodyEventId: event.id, parcelId: event.parcelId, superAgentId: hub.id,
      physicalHandoffRef: event.evidenceRef ?? null, rateConfigId: future.id,
      amount: 500, currency: 'TZS', source: event.eventKind, actorUserId: null,
    }));
    await expect(rateService.deactivateRate(future.id)).rejects.toThrow(ConflictException);
  });

  it('idempotent: retracting an already-inactive draft is a no-op, not an error', async () => {
    const draft = await rateService.configureRate({
      commissionType: 'handling', amount: 999, effectiveFrom: new Date('2031-01-01T00:00:00Z'), createdByUserId: 1,
    });
    await rateService.deactivateRate(draft.id);
    await expect(rateService.deactivateRate(draft.id)).resolves.toMatchObject({ isActive: false });
  });

  // ── qualifying eligibility ──────────────────────────────────────────────
  it('an origin desk receipt (Super Agent receiving) generates a correct earning', async () => {
    await rateService.configureRate({ commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 1000), createdByUserId: null });
    const hub = await mkSuperAgent();
    const event = await mkCustodyEvent({ eventKind: 'origin_hub_received', toCustodianType: 'super_agent', toCustodianId: hub.id });

    const earning = await earningService.recordEarningForCustodyEvent(event.id, { userId: null });
    expect(Number(earning.amount)).toBe(500);
    expect(earning.currency).toBe('TZS');
    expect(earning.superAgentId).toBe(hub.id);
    expect(earning.parcelId).toBe(event.parcelId);
    expect(earning.custodyEventId).toBe(event.id);
    expect(earning.source).toBe('origin_hub_received');
  });

  it('a destination desk receipt following unloading (Provider -> Super Agent) generates an INDEPENDENT earning from the origin receipt', async () => {
    await rateService.configureRate({ commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 1000), createdByUserId: null });
    const originHub = await mkSuperAgent();
    const destHub = await mkSuperAgent();
    const originEvent = await mkCustodyEvent({ parcelId: 42, eventKind: 'origin_hub_received', toCustodianType: 'super_agent', toCustodianId: originHub.id });
    const destEvent = await mkCustodyEvent({ parcelId: 42, eventKind: 'parcel_run_unloaded', fromCustodianType: 'transport_provider', toCustodianType: 'super_agent', toCustodianId: destHub.id });

    const originEarning = await earningService.recordEarningForCustodyEvent(originEvent.id, { userId: null });
    const destEarning = await earningService.recordEarningForCustodyEvent(destEvent.id, { userId: null });
    expect(originEarning.id).not.toBe(destEarning.id);
    expect(originEarning.superAgentId).toBe(originHub.id);
    expect(destEarning.superAgentId).toBe(destHub.id);
    expect(await earningRepo.count({ where: { parcelId: 42 } })).toBe(2);
  });

  // ── cross-pathway dedup on a PROVEN physical-handoff identity (Stage 3S-C6 second correction) ──
  it('two DIFFERENT custody events sharing the SAME evidenceRef (a PROVEN concrete-operation identity) collapse to one earning', async () => {
    await rateService.configureRate({ commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 1000), createdByUserId: null });
    const hub = await mkSuperAgent();
    // Two SEPARATE custody-event rows, as if two different pathways each
    // independently recorded the SAME real physical handoff -- but both
    // name the same concrete operation.
    const firstWrite = await mkCustodyEvent({
      parcelId: 1, eventKind: 'parcel_run_unloaded', evidenceRef: 'parcel_run_assignment:501',
      fromCustodianType: 'transport_provider', toCustodianType: 'super_agent', toCustodianId: hub.id,
    });
    const secondWrite = await mkCustodyEvent({
      parcelId: 1, eventKind: 'parcel_run_unloaded', evidenceRef: 'parcel_run_assignment:501',
      fromCustodianType: 'transport_provider', toCustodianType: 'super_agent', toCustodianId: hub.id,
    });

    const first = await earningService.recordEarningForCustodyEvent(firstWrite.id, { userId: null });
    const second = await earningService.recordEarningForCustodyEvent(secondWrite.id, { userId: null });
    expect(second.id).toBe(first.id); // the SAME earning, not a duplicate payment
    expect(await earningRepo.count({ where: { parcelId: 1, superAgentId: hub.id } })).toBe(1);
  });

  it('two DIFFERENT custody events with DIFFERENT evidenceRef earn independently, even for the SAME (parcel, Super Agent) pair -- a genuinely separate handling operation', async () => {
    await rateService.configureRate({ commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 1000), createdByUserId: null });
    const hub = await mkSuperAgent();
    // Same hub receives the SAME parcel twice, from two genuinely different
    // CONCRETE operations -- e.g. an origin hand-off (a real Collection),
    // then later a real destination receipt (a real Run assignment). The
    // earlier (parcelId, superAgentId)-only, and then sourceCustodianType-
    // based, constraints would have wrongly collapsed this into one earning.
    const originEvent = await mkCustodyEvent({
      parcelId: 1, eventKind: 'collection_received_at_origin_hub', evidenceRef: 'collection:900',
      fromCustodianType: 'local_agent', fromCustodianId: 77,
      toCustodianType: 'super_agent', toCustodianId: hub.id,
    });
    const destEvent = await mkCustodyEvent({
      parcelId: 1, eventKind: 'parcel_run_unloaded', evidenceRef: 'parcel_run_assignment:901',
      fromCustodianType: 'transport_provider', toCustodianType: 'super_agent', toCustodianId: hub.id,
    });

    const originEarning = await earningService.recordEarningForCustodyEvent(originEvent.id, { userId: null });
    const destEarning = await earningService.recordEarningForCustodyEvent(destEvent.id, { userId: null });
    expect(originEarning.id).not.toBe(destEarning.id);
    expect(originEarning.physicalHandoffRef).toBe('collection:900');
    expect(destEarning.physicalHandoffRef).toBe('parcel_run_assignment:901');
    expect(await earningRepo.count({ where: { parcelId: 1, superAgentId: hub.id } })).toBe(2);
  });

  it('a qualifying event with NO evidenceRef at all earns independently (never silently merged) and flags the pairing for review once a prior earning already exists', async () => {
    await rateService.configureRate({ commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 1000), createdByUserId: null });
    const hub = await mkSuperAgent();
    const first = await mkCustodyEvent({
      parcelId: 1, eventKind: 'origin_hub_received', toCustodianType: 'super_agent', toCustodianId: hub.id,
    });
    const firstEarning = await earningService.recordEarningForCustodyEvent(first.id, { userId: null });
    expect(await activityEventRepo.count({ where: { eventType: 'SUPER_AGENT_HANDLING_EARNING_UNPROVABLE_DUPLICATE_RISK' } })).toBe(0);

    // A SECOND qualifying event, same parcel/agent, ALSO with no evidenceRef
    // -- cross-writer equivalence with `first` can't be proven either way.
    const second = await mkCustodyEvent({
      parcelId: 1, eventKind: 'origin_hub_received', toCustodianType: 'super_agent', toCustodianId: hub.id,
    });
    const secondEarning = await earningService.recordEarningForCustodyEvent(second.id, { userId: null });

    // Never silently merged -- a real, independent second earning.
    expect(secondEarning.id).not.toBe(firstEarning.id);
    expect(await earningRepo.count({ where: { parcelId: 1, superAgentId: hub.id } })).toBe(2);

    // But the ambiguity IS flagged, durably, for a human to review.
    const flags = await activityEventRepo.find({ where: { eventType: 'SUPER_AGENT_HANDLING_EARNING_UNPROVABLE_DUPLICATE_RISK' } });
    expect(flags).toHaveLength(1);
    expect(flags[0].category).toBe(ActivityCategory.LOGISTICS);
    expect(flags[0].severity).toBe('warning');
    expect(flags[0].visibility).toBe('admin');
    expect(flags[0].metadata).toMatchObject({ parcelId: 1, superAgentId: hub.id });
  });

  it('a Super Agent RELEASING custody (the C4 load event, Super Agent -> provider) never generates an earning on its own', async () => {
    await rateService.configureRate({ commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 1000), createdByUserId: null });
    const hub = await mkSuperAgent();
    // toCustodianId deliberately set to a REAL, existing Super Agent id (a
    // different one, standing in for "the provider" here) -- so this test
    // discriminates on the eligibility DIRECTION check specifically. If it
    // used a nonexistent id instead, a buggy eligibility check that wrongly
    // let this event through would still incidentally throw the same
    // BadRequestException from the Super-Agent-existence check afterward,
    // masking the real bug (caught exactly this way during mutation testing).
    const notTheActor = await mkSuperAgent();
    const event = await mkCustodyEvent({ eventKind: 'parcel_run_loaded', fromCustodianType: 'super_agent', fromCustodianId: hub.id, toCustodianType: 'transport_provider', toCustodianId: notTheActor.id });

    await expect(earningService.recordEarningForCustodyEvent(event.id, { userId: null })).rejects.toThrow(BadRequestException);
    expect(await earningRepo.count()).toBe(0);
  });

  it('a Run merely passing an ordinary (non-Super-Agent) stop generates zero earnings', async () => {
    await rateService.configureRate({ commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 1000), createdByUserId: null });
    // Same reasoning as above -- a real Super Agent id in toCustodianId so
    // this genuinely discriminates on the eligibility check, not on a
    // coincidental existence-check failure.
    const notTheActor = await mkSuperAgent();
    const event = await mkCustodyEvent({ eventKind: 'parcel_run_loaded', fromCustodianType: null, fromCustodianId: null, toCustodianType: 'transport_provider', toCustodianId: notTheActor.id });

    await expect(earningService.recordEarningForCustodyEvent(event.id, { userId: null })).rejects.toThrow(BadRequestException);
    expect(await earningRepo.count()).toBe(0);
  });

  it('Agent-only movement (never Super Agent custody) generates zero Super Agent commission', async () => {
    await rateService.configureRate({ commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 1000), createdByUserId: null });
    const event = await mkCustodyEvent({ eventKind: 'recipient_agent_delivery', fromCustodianType: 'local_agent', fromCustodianId: 3, toCustodianType: 'recipient_contact', toCustodianId: null });

    await expect(earningService.recordEarningForCustodyEvent(event.id, { userId: null })).rejects.toThrow(BadRequestException);
    expect(await earningRepo.count()).toBe(0);
  });

  it('rejects a missing/invalid Super Agent identity even when custodian direction looks qualifying', async () => {
    await rateService.configureRate({ commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 1000), createdByUserId: null });
    const event = await mkCustodyEvent({ eventKind: 'origin_hub_received', toCustodianType: 'super_agent', toCustodianId: 999999 });

    await expect(earningService.recordEarningForCustodyEvent(event.id, { userId: null })).rejects.toThrow(BadRequestException);
    expect(await earningRepo.count()).toBe(0);
  });

  it('rejects a custody event whose parcelId does not reference an existing Parcel', async () => {
    await rateService.configureRate({ commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 1000), createdByUserId: null });
    const hub = await mkSuperAgent();
    const event = await mkCustodyEvent({ parcelId: 999999, toCustodianType: 'super_agent', toCustodianId: hub.id });

    await expect(earningService.recordEarningForCustodyEvent(event.id, { userId: null })).rejects.toThrow(BadRequestException);
    expect(await earningRepo.count()).toBe(0);
  });

  // ── bound eligibility to the trusted custody-event contract, not just direction ──
  it('rejects a "receiving" event with no real authenticated actor behind it (actorSource=system), even though custodian direction looks correct', async () => {
    await rateService.configureRate({ commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 1000), createdByUserId: null });
    const hub = await mkSuperAgent();
    const event = await mkCustodyEvent({ toCustodianType: 'super_agent', toCustodianId: hub.id, actorSource: 'system' });

    await expect(earningService.recordEarningForCustodyEvent(event.id, { userId: null })).rejects.toThrow(BadRequestException);
    expect(await earningRepo.count()).toBe(0);
  });

  it('rejects an illegitimate prior-custodian shape (e.g. a recipient somehow "handing back" to a Super Agent)', async () => {
    await rateService.configureRate({ commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 1000), createdByUserId: null });
    const hub = await mkSuperAgent();
    const event = await mkCustodyEvent({
      fromCustodianType: 'recipient_contact', fromCustodianId: null,
      toCustodianType: 'super_agent', toCustodianId: hub.id,
    });

    await expect(earningService.recordEarningForCustodyEvent(event.id, { userId: null })).rejects.toThrow(BadRequestException);
    expect(await earningRepo.count()).toBe(0);
  });

  it('rejects a degenerate self-transfer (identical custodian on both sides) even though direction and actor both look correct', async () => {
    await rateService.configureRate({ commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 1000), createdByUserId: null });
    const hub = await mkSuperAgent();
    const event = await mkCustodyEvent({
      fromCustodianType: 'super_agent', fromCustodianId: hub.id,
      toCustodianType: 'super_agent', toCustodianId: hub.id,
    });

    await expect(earningService.recordEarningForCustodyEvent(event.id, { userId: null })).rejects.toThrow(BadRequestException);
    expect(await earningRepo.count()).toBe(0);
  });

  it('accepts a legitimate hub-to-hub transfer (a Super Agent handing off to a DIFFERENT Super Agent) as a genuine receiving event', async () => {
    await rateService.configureRate({ commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 1000), createdByUserId: null });
    const originHub = await mkSuperAgent();
    const destHub = await mkSuperAgent();
    const event = await mkCustodyEvent({
      fromCustodianType: 'super_agent', fromCustodianId: originHub.id,
      toCustodianType: 'super_agent', toCustodianId: destHub.id,
    });

    const earning = await earningService.recordEarningForCustodyEvent(event.id, { userId: null });
    expect(earning.superAgentId).toBe(destHub.id);
  });

  // ── second re-review correction: the real Agent-pickup-to-hub-handover pathway ──
  it('accepts the ACTUAL canonical Agent-pickup hub-handover shape (parcel-collections.service.ts\'s own collection_received_at_origin_hub event) as a genuine qualifying receipt', async () => {
    await rateService.configureRate({ commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 1000), createdByUserId: null });
    const hub = await mkSuperAgent();
    const realAgentProfileId = 77; // stands in for a real Agent.id -- never validated by this service, exactly like every other fromCustodianId
    // Mirrors parcel-collections.service.ts's own real insert (lines ~378-387)
    // field-for-field: eventKind, both custodian sides, and actorSource --
    // the ACTUAL shape that pathway ships today, not an approximation.
    const event = await mkCustodyEvent({
      eventKind: 'collection_received_at_origin_hub',
      fromCustodianType: 'local_agent', fromCustodianId: realAgentProfileId,
      toCustodianType: 'super_agent', toCustodianId: hub.id,
      actorSource: 'account_role',
    });

    const earning = await earningService.recordEarningForCustodyEvent(event.id, { userId: null });
    expect(earning.superAgentId).toBe(hub.id);
    expect(earning.source).toBe('collection_received_at_origin_hub');
    expect(await earningRepo.count()).toBe(1);
  });

  it('rejects the REVERSE direction of the same handover (a Super Agent handing off TO a local Agent) -- never a qualifying receipt', async () => {
    await rateService.configureRate({ commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 1000), createdByUserId: null });
    const hub = await mkSuperAgent();
    const event = await mkCustodyEvent({
      eventKind: 'collection_received_at_origin_hub',
      fromCustodianType: 'super_agent', fromCustodianId: hub.id,
      toCustodianType: 'local_agent', toCustodianId: 77,
      actorSource: 'account_role',
    });

    await expect(earningService.recordEarningForCustodyEvent(event.id, { userId: null })).rejects.toThrow(BadRequestException);
    expect(await earningRepo.count()).toBe(0);
  });

  it('rejects a local-Agent-only delivery (Agent -> recipient) that never reaches Super Agent custody at all', async () => {
    await rateService.configureRate({ commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 1000), createdByUserId: null });
    const event = await mkCustodyEvent({
      eventKind: 'recipient_agent_delivery',
      fromCustodianType: 'local_agent', fromCustodianId: 77,
      toCustodianType: 'recipient_contact', toCustodianId: null,
      actorSource: 'account_role',
    });

    await expect(earningService.recordEarningForCustodyEvent(event.id, { userId: null })).rejects.toThrow(BadRequestException);
    expect(await earningRepo.count()).toBe(0);
  });

  it('rejects an unknown custody event id', async () => {
    await expect(earningService.recordEarningForCustodyEvent(999999, { userId: null })).rejects.toThrow(NotFoundException);
  });

  it('rejects recording an earning when no rate configuration is effective at that time', async () => {
    const hub = await mkSuperAgent();
    const event = await mkCustodyEvent({ eventKind: 'origin_hub_received', toCustodianType: 'super_agent', toCustodianId: hub.id });
    await expect(earningService.recordEarningForCustodyEvent(event.id, { userId: null })).rejects.toThrow(ConflictException);
  });

  // ── idempotency / concurrency ───────────────────────────────────────────
  it('repeated earning requests for the SAME custody event never duplicate -- returns the same row', async () => {
    await rateService.configureRate({ commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 1000), createdByUserId: null });
    const hub = await mkSuperAgent();
    const event = await mkCustodyEvent({ eventKind: 'origin_hub_received', toCustodianType: 'super_agent', toCustodianId: hub.id });

    const first = await earningService.recordEarningForCustodyEvent(event.id, { userId: null });
    const second = await earningService.recordEarningForCustodyEvent(event.id, { userId: null });
    expect(second.id).toBe(first.id);
    expect(await earningRepo.count()).toBe(1);

    // Independent DB-level backstop: a raw attempt to insert a second row
    // under the SAME custodyEventId is rejected by the unique index itself.
    await expect(ds.query(
      `INSERT INTO public.super_agent_handling_earning
         ("custodyEventId","parcelId","superAgentId","physicalHandoffRef","rateConfigId",amount,currency,source)
       VALUES ($1,$2,$3,$4,$5,500,'TZS','origin_hub_received')`,
      [event.id, event.parcelId, hub.id, first.physicalHandoffRef, first.rateConfigId],
    )).rejects.toThrow();
  });

  it('concurrent earning requests for the SAME custody event cannot duplicate', async () => {
    await rateService.configureRate({ commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 1000), createdByUserId: null });
    const hub = await mkSuperAgent();
    const event = await mkCustodyEvent({ eventKind: 'origin_hub_received', toCustodianType: 'super_agent', toCustodianId: hub.id });

    const [a, b] = await Promise.all([
      earningService.recordEarningForCustodyEvent(event.id, { userId: null }),
      earningService.recordEarningForCustodyEvent(event.id, { userId: null }),
    ]);
    expect(a.id).toBe(b.id);
    expect(await earningRepo.count()).toBe(1);
  });

  // ── historical rate protection ──────────────────────────────────────────
  it('changing the rate configuration cannot reprice an already-recorded historical earning', async () => {
    await rateService.configureRate({
      commissionType: 'handling', amount: 500,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'), effectiveTo: new Date('2026-06-01T00:00:00Z'),
      createdByUserId: null,
    });
    const hub = await mkSuperAgent();
    const oldEvent = await mkCustodyEvent({
      eventKind: 'origin_hub_received', toCustodianType: 'super_agent', toCustodianId: hub.id,
      recordedAt: new Date('2026-03-01T00:00:00Z'),
    });
    const oldEarning = await earningService.recordEarningForCustodyEvent(oldEvent.id, { userId: null });
    expect(Number(oldEarning.amount)).toBe(500);

    // A new, higher rate takes effect afterward.
    await rateService.configureRate({
      commissionType: 'handling', amount: 700, effectiveFrom: new Date('2026-06-01T00:00:00Z'), createdByUserId: null,
    });

    const reread = await earningRepo.findOneOrFail({ where: { id: oldEarning.id } });
    expect(Number(reread.amount)).toBe(500); // completely unchanged by the later rate change

    // A DIFFERENT parcel handled by the SAME hub afterward -- not the same
    // (parcelId, superAgentId) pair as oldEvent, which Stage 3S-C6's own
    // cross-pathway dedup constraint would otherwise (correctly) collapse
    // into "already compensated" rather than a genuinely new earning. This
    // is also the more representative real scenario: the same Super Agent
    // handling many different parcels over time, each correctly priced at
    // whatever rate was in effect when THAT parcel's own event occurred.
    const newEvent = await mkCustodyEvent({
      parcelId: 42, eventKind: 'origin_hub_received', toCustodianType: 'super_agent', toCustodianId: hub.id,
      recordedAt: new Date('2026-08-01T00:00:00Z'),
    });
    const newEarning = await earningService.recordEarningForCustodyEvent(newEvent.id, { userId: null });
    expect(Number(newEarning.amount)).toBe(700); // the new event correctly gets the new rate
  });

  it('the earning ledger is immutable', async () => {
    await rateService.configureRate({ commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 1000), createdByUserId: null });
    const hub = await mkSuperAgent();
    const event = await mkCustodyEvent({ eventKind: 'origin_hub_received', toCustodianType: 'super_agent', toCustodianId: hub.id });
    const earning = await earningService.recordEarningForCustodyEvent(event.id, { userId: null });

    await expect(ds.query(`UPDATE public.super_agent_handling_earning SET amount = 1 WHERE id = $1`, [earning.id])).rejects.toThrow();
    await expect(ds.query(`DELETE FROM public.super_agent_handling_earning WHERE id = $1`, [earning.id])).rejects.toThrow();
  });
});
