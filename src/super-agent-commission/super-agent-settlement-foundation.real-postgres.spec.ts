import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource, Repository } from 'typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { getB5BTestConnectionConfig, resetB5BTestSchema, B5B_BASE_ENTITIES } from '../business/b5b-closure-test-db';
import { SuperAgent, SuperAgentStatus } from '../super-agents/entities/super-agent.entity';
import { User } from '../users/entities/user.entity';
import { ParcelCustodyEvent } from '../super-agents/entities/parcel-custody-event.entity';
import { SuperAgentHandlingRate } from './entities/super-agent-handling-rate.entity';
import { SuperAgentHandlingEarning } from './entities/super-agent-handling-earning.entity';
import { SuperAgentCashCollection } from './entities/super-agent-cash-collection.entity';
import { SuperAgentSettlementProposal } from './entities/super-agent-settlement-proposal.entity';
import { SuperAgentSettlementEarningMember } from './entities/super-agent-settlement-earning-member.entity';
import { SuperAgentSettlementCashCollectionMember } from './entities/super-agent-settlement-cash-collection-member.entity';
import { SuperAgentCashRemittance } from './entities/super-agent-cash-remittance.entity';
import { SuperAgentCashRemittanceAllocation } from './entities/super-agent-cash-remittance-allocation.entity';
import { SuperAgentHandlingEarningPayout } from './entities/super-agent-handling-earning-payout.entity';
import { SuperAgentHandlingEarningPayoutAllocation } from './entities/super-agent-handling-earning-payout-allocation.entity';
import { Wallet } from '../wallet/entities/wallet.entity';
import { WalletTransaction, WalletTransactionType } from '../wallet/entities/wallet-transaction.entity';
import {
  ensureSuperAgentHandlingRateNoOverlapConstraint,
  ensureSuperAgentEconomicLedgersImmutable,
} from './super-agent-commission-schema';
import {
  ensureWalletSuperAgentOwnershipConstraint,
  ensureSuperAgentSettlementLedgersImmutable,
} from './super-agent-settlement-schema';
import { SuperAgentHandlingRateService } from './super-agent-handling-rate.service';
import { SuperAgentSettlementService } from './super-agent-settlement.service';
import { SuperAgentCashRemittanceService } from './super-agent-cash-remittance.service';
import { SuperAgentHandlingEarningPayoutService } from './super-agent-handling-earning-payout.service';
import { WalletService } from '../wallet/wallet.service';
import { VerificationService } from '../identity/verification.service';
import { PayoutDestinationService } from '../wallet/payout-destination.service';
import { OwnershipFeatureFlagsService } from '../ownership/ownership-feature-flags.service';

/**
 * Stage 3S-C7 — Payment Validation and Cash-Desk Settlement Foundation,
 * proved against REAL PostgreSQL. Covers all three parts authorized on
 * Issue #62: Part A (settlement proposal, no money movement), Part B-A
 * (cash remittance), Part B-B (commission payout). No controller, no
 * scheduler, no live-money activation anywhere in this file or the
 * services it exercises.
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('Stage 3S-C7 — Payment Validation and Cash-Desk Settlement Foundation, real PostgreSQL', () => {
  jest.setTimeout(180000);
  let ds: DataSource;
  let earningRepo: Repository<SuperAgentHandlingEarning>;
  let cashRepo: Repository<SuperAgentCashCollection>;
  let custodyRepo: Repository<ParcelCustodyEvent>;
  let rateRepo: Repository<SuperAgentHandlingRate>;
  let proposalRepo: Repository<SuperAgentSettlementProposal>;
  let remittanceRepo: Repository<SuperAgentCashRemittance>;
  let payoutRepo: Repository<SuperAgentHandlingEarningPayout>;
  let walletRepo: Repository<Wallet>;
  let walletTxRepo: Repository<WalletTransaction>;

  let rateService: SuperAgentHandlingRateService;
  let settlementService: SuperAgentSettlementService;
  let remittanceService: SuperAgentCashRemittanceService;
  let payoutService: SuperAgentHandlingEarningPayoutService;
  let walletService: WalletService;

  let userSeq = 0;
  let opKeySeq = 0;
  let idemSeq = 0;

  const mkSuperAgent = async () => {
    const u = await ds.getRepository(User).save(ds.getRepository(User).create({
      email: `c7-sa-${++userSeq}@s3sc7.local`, phone: `+2557${String(userSeq).padStart(8, '0')}`, password: 'x', name: 'SA',
    } as any));
    return ds.getRepository(SuperAgent).save(ds.getRepository(SuperAgent).create({
      userId: (u as any).id, businessName: 'Hub', city: 'Dar es Salaam', status: SuperAgentStatus.ACTIVE,
    } as any) as unknown as SuperAgent);
  };

  // Direct insert, bypassing SuperAgentHandlingEarningService's own
  // eligibility pipeline (already proven in C5/C6) -- these settlement
  // tests exercise the settlement/remittance/payout layer itself. Still
  // needs a REAL custody event and rate row to satisfy the earning table's
  // own real FK constraints.
  // Both tables are immutable (BEFORE UPDATE/DELETE trigger) -- backdating
  // for period-scoping tests MUST happen at INSERT time via raw SQL, never
  // via a post-insert UPDATE (which the trigger correctly rejects). Real
  // production code never backdates; this is a test-fixture-only need.
  const mkEarning = async (o: { superAgentId: number; amount: number; currency?: string; createdAt?: Date; parcelId?: number }) => {
    const rate = await rateRepo.findOne({ where: { commissionType: 'handling', scope: 'global' } });
    const event = await custodyRepo.save(custodyRepo.create({
      parcelId: o.parcelId ?? 1, eventKind: 'origin_hub_received', operationKey: `c7-earning-${++opKeySeq}`,
      toCustodianType: 'super_agent', toCustodianId: o.superAgentId, actorSource: 'account_role', assignmentType: null,
    } as any));
    const rows = await ds.query(
      `INSERT INTO public.super_agent_handling_earning
        ("custodyEventId", "parcelId", "superAgentId", "physicalHandoffRef", "rateConfigId", amount, currency, source, "actorUserId", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, COALESCE($9, now()))
       RETURNING *`,
      [event.id, o.parcelId ?? 1, o.superAgentId, `c7-test:${event.id}`, rate!.id, o.amount, o.currency ?? 'TZS', event.eventKind, o.createdAt ?? null],
    );
    return earningRepo.create(rows[0]);
  };

  const mkCashCollection = async (o: { superAgentId: number; amount: number; currency?: string; createdAt?: Date; parcelId?: number }) => {
    const rows = await ds.query(
      `INSERT INTO public.super_agent_cash_collection
        ("parcelId", "superAgentId", "quoteId", "priceContextAmount", "priceContextCurrency", "collectedAmount", currency, "paymentMethod", "actorUserId", "receiptReference", "idempotencyKey", "createdAt")
       VALUES ($1, $2, NULL, $3, $4, $5, $6, 'cash', $7, NULL, $8, COALESCE($9, now()))
       RETURNING *`,
      [o.parcelId ?? 1, o.superAgentId, o.amount, o.currency ?? 'TZS', o.amount, o.currency ?? 'TZS', 1, `c7-cash-${++idemSeq}`, o.createdAt ?? null],
    );
    return cashRepo.create(rows[0]);
  };

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();

    ds = new DataSource({
      type: 'postgres', host: config!.host, port: config!.port, username: config!.user, password: config!.password,
      database: config!.database, synchronize: true, extra: { max: 20 },
      entities: [
        ...B5B_BASE_ENTITIES, ParcelCustodyEvent, SuperAgentHandlingRate, SuperAgentHandlingEarning, SuperAgentCashCollection,
        SuperAgentSettlementProposal, SuperAgentSettlementEarningMember, SuperAgentSettlementCashCollectionMember,
        SuperAgentCashRemittance, SuperAgentCashRemittanceAllocation,
        SuperAgentHandlingEarningPayout, SuperAgentHandlingEarningPayoutAllocation,
        Wallet, WalletTransaction,
      ],
    });
    await ds.initialize();
    await ensureSuperAgentHandlingRateNoOverlapConstraint((sql) => ds.query(sql));
    await ensureSuperAgentEconomicLedgersImmutable((sql) => ds.query(sql));
    await ensureWalletSuperAgentOwnershipConstraint((sql) => ds.query(sql));
    await ensureSuperAgentSettlementLedgersImmutable((sql) => ds.query(sql));
    await ds.query('CREATE TABLE public.parcel (id integer PRIMARY KEY)');
    await ds.query('INSERT INTO public.parcel VALUES (1),(2),(3)');
    // Wallet's own pre-C7 CHECK constraint never had a decorator mirror at
    // all (a pre-existing gap, not this gate's to retroactively fix) -- this
    // spec only needs the NEW 3-way version to be real, which the helper
    // above already ensured.

    earningRepo = ds.getRepository(SuperAgentHandlingEarning);
    cashRepo = ds.getRepository(SuperAgentCashCollection);
    custodyRepo = ds.getRepository(ParcelCustodyEvent);
    rateRepo = ds.getRepository(SuperAgentHandlingRate);
    proposalRepo = ds.getRepository(SuperAgentSettlementProposal);
    remittanceRepo = ds.getRepository(SuperAgentCashRemittance);
    payoutRepo = ds.getRepository(SuperAgentHandlingEarningPayout);
    walletRepo = ds.getRepository(Wallet);
    walletTxRepo = ds.getRepository(WalletTransaction);

    rateService = new SuperAgentHandlingRateService(rateRepo, earningRepo);
    settlementService = new SuperAgentSettlementService(proposalRepo, ds);
    remittanceService = new SuperAgentCashRemittanceService(remittanceRepo, ds);

    // WalletService's own real constructor dependencies -- minimal real
    // instances, matching this lineage's own "real repos, no mocks"
    // discipline. VerificationService/PayoutDestinationService/
    // OwnershipFeatureFlagsService are never exercised by creditWallet()
    // (only by withdrawal paths this gate never calls), so bare stand-ins
    // satisfying their own constructors are sufficient here.
    const verification = { getLevel: async () => 1 } as unknown as VerificationService;
    const payoutDestinations = {} as unknown as PayoutDestinationService;
    const flags = { isEnabled: () => true } as unknown as OwnershipFeatureFlagsService;
    walletService = new WalletService(walletRepo, walletTxRepo, ds.getRepository(User), ds, verification, payoutDestinations, flags);

    payoutService = new SuperAgentHandlingEarningPayoutService(payoutRepo, proposalRepo, walletService, ds);

    await rateService.configureRate({ commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 3600000), createdByUserId: null });
  });

  afterAll(async () => { if (ds) await ds.destroy().catch(() => {}); });

  beforeEach(async () => {
    // TRUNCATE, not DELETE -- every C5/C6/C7 ledger here is immutable.
    // CASCADE clears every table's own dependents transitively.
    await ds.query(`TRUNCATE TABLE public.super_agent_handling_earning_payout_allocation RESTART IDENTITY CASCADE`);
    await ds.query(`TRUNCATE TABLE public.super_agent_handling_earning_payout RESTART IDENTITY CASCADE`);
    await ds.query(`TRUNCATE TABLE public.super_agent_cash_remittance_allocation RESTART IDENTITY CASCADE`);
    await ds.query(`TRUNCATE TABLE public.super_agent_cash_remittance RESTART IDENTITY CASCADE`);
    await ds.query(`TRUNCATE TABLE public.super_agent_settlement_earning_member RESTART IDENTITY CASCADE`);
    await ds.query(`TRUNCATE TABLE public.super_agent_settlement_cash_collection_member RESTART IDENTITY CASCADE`);
    await ds.query(`TRUNCATE TABLE public.super_agent_settlement_proposal RESTART IDENTITY CASCADE`);
    await ds.query(`TRUNCATE TABLE public.super_agent_handling_earning RESTART IDENTITY CASCADE`);
    await ds.query(`TRUNCATE TABLE public.super_agent_cash_collection RESTART IDENTITY CASCADE`);
    await ds.query(`DELETE FROM public.wallet_transaction`);
    await ds.query(`DELETE FROM public.wallet`);
    await ds.query(`DELETE FROM public.parcel_custody_event`);
    await ds.query(`DELETE FROM public.super_agent`);
  });

  // ── Part A: settlement proposal -- frozen, validated, no money movement ──
  describe('Part A: SuperAgentSettlementService', () => {
    it('freezes correct totals for the five separate numbers -- never netted into one', async () => {
      const hub = await mkSuperAgent();
      const periodStart = new Date('2026-01-01T00:00:00Z');
      const periodEnd = new Date('2026-02-01T00:00:00Z');
      const e1 = await mkEarning({ superAgentId: hub.id, amount: 500, createdAt: new Date('2026-01-05T00:00:00Z') });
      const e2 = await mkEarning({ superAgentId: hub.id, amount: 700, createdAt: new Date('2026-01-15T00:00:00Z') });
      const c1 = await mkCashCollection({ superAgentId: hub.id, amount: 1000, createdAt: new Date('2026-01-10T00:00:00Z') });

      const proposal = await settlementService.createSettlementProposal({
        superAgentId: hub.id, currency: 'TZS', periodStart, periodEnd, actorUserId: null,
      });

      expect(Number(proposal.totalEarningsAmount)).toBe(1200);
      expect(proposal.totalEarningsCount).toBe(2);
      expect(Number(proposal.totalCashCollectedAmount)).toBe(1000);
      expect(proposal.totalCashCollectedCount).toBe(1);
      expect(Number(proposal.totalCashRemittedAmount)).toBe(0); // nothing remitted yet
      expect(Number(proposal.totalCashOutstandingAmount)).toBe(1000); // all of it outstanding
      expect(proposal.hasDiscrepancy).toBe(false);
      expect(proposal.status).toBe('finalized');

      const detail = await settlementService.getSettlementDetail(proposal.id);
      expect(detail.earningIds.sort()).toEqual([e1.id, e2.id].sort());
      expect(detail.cashCollectionIds).toEqual([c1.id]);
    });

    it('excludes rows outside the requested period', async () => {
      const hub = await mkSuperAgent();
      await mkEarning({ superAgentId: hub.id, amount: 500, createdAt: new Date('2025-12-31T23:59:59Z') }); // just before
      await mkEarning({ superAgentId: hub.id, amount: 700, createdAt: new Date('2026-02-01T00:00:00Z') }); // exactly at end (exclusive)
      const inScope = await mkEarning({ superAgentId: hub.id, amount: 300, createdAt: new Date('2026-01-15T00:00:00Z') });

      const proposal = await settlementService.createSettlementProposal({
        superAgentId: hub.id, currency: 'TZS',
        periodStart: new Date('2026-01-01T00:00:00Z'), periodEnd: new Date('2026-02-01T00:00:00Z'),
        actorUserId: null,
      });
      expect(Number(proposal.totalEarningsAmount)).toBe(300);
      const detail = await settlementService.getSettlementDetail(proposal.id);
      expect(detail.earningIds).toEqual([inScope.id]);
    });

    it('validates currency consistency: a different-currency row in the same period/Super Agent is excluded AND flagged, never silently dropped', async () => {
      const hub = await mkSuperAgent();
      const periodStart = new Date('2026-01-01T00:00:00Z');
      const periodEnd = new Date('2026-02-01T00:00:00Z');
      await mkEarning({ superAgentId: hub.id, amount: 500, currency: 'TZS', createdAt: new Date('2026-01-05T00:00:00Z') });
      await mkEarning({ superAgentId: hub.id, amount: 50, currency: 'USD', createdAt: new Date('2026-01-06T00:00:00Z') });

      const proposal = await settlementService.createSettlementProposal({
        superAgentId: hub.id, currency: 'TZS', periodStart, periodEnd, actorUserId: null,
      });
      expect(Number(proposal.totalEarningsAmount)).toBe(500); // USD row excluded from the total
      expect(proposal.totalEarningsCount).toBe(1);
      expect(proposal.hasDiscrepancy).toBe(true);
      expect(proposal.discrepancyNote).toContain('different currency');
    });

    it('rejects a periodEnd not after periodStart', async () => {
      const hub = await mkSuperAgent();
      await expect(settlementService.createSettlementProposal({
        superAgentId: hub.id, currency: 'TZS',
        periodStart: new Date('2026-02-01T00:00:00Z'), periodEnd: new Date('2026-01-01T00:00:00Z'),
        actorUserId: null,
      })).rejects.toThrow(BadRequestException);
    });

    it('rejects an unknown Super Agent', async () => {
      await expect(settlementService.createSettlementProposal({
        superAgentId: 999999, currency: 'TZS',
        periodStart: new Date('2026-01-01T00:00:00Z'), periodEnd: new Date('2026-02-01T00:00:00Z'),
        actorUserId: null,
      })).rejects.toThrow(NotFoundException);
    });

    // ── no double counting ──────────────────────────────────────────────
    it('a row already claimed by an earlier settlement can never be claimed by a second one -- a later settlement simply does not see it', async () => {
      const hub = await mkSuperAgent();
      const createdAt = new Date('2026-01-05T00:00:00Z');
      const e = await mkEarning({ superAgentId: hub.id, amount: 500, createdAt });

      const first = await settlementService.createSettlementProposal({
        superAgentId: hub.id, currency: 'TZS',
        periodStart: new Date('2026-01-01T00:00:00Z'), periodEnd: new Date('2026-02-01T00:00:00Z'),
        actorUserId: null,
      });
      expect(Number(first.totalEarningsAmount)).toBe(500);

      // A SECOND settlement over an OVERLAPPING period must not re-claim it.
      const second = await settlementService.createSettlementProposal({
        superAgentId: hub.id, currency: 'TZS',
        periodStart: new Date('2026-01-01T00:00:00Z'), periodEnd: new Date('2026-03-01T00:00:00Z'),
        actorUserId: null,
      });
      expect(Number(second.totalEarningsAmount)).toBe(0);
      expect(second.totalEarningsCount).toBe(0);

      // The DB-level backstop: a raw attempt to double-insert a membership
      // row for the SAME earning is rejected outright.
      await expect(ds.query(
        `INSERT INTO public.super_agent_settlement_earning_member ("settlementProposalId", "earningId") VALUES ($1, $2)`,
        [second.id, e.id],
      )).rejects.toThrow();
    });

    it('two different Super Agents\' settlements never interfere with each other', async () => {
      const hubA = await mkSuperAgent();
      const hubB = await mkSuperAgent();
      await mkEarning({ superAgentId: hubA.id, amount: 500, createdAt: new Date('2026-01-05T00:00:00Z') });
      await mkEarning({ superAgentId: hubB.id, amount: 700, createdAt: new Date('2026-01-05T00:00:00Z') });

      const propA = await settlementService.createSettlementProposal({
        superAgentId: hubA.id, currency: 'TZS',
        periodStart: new Date('2026-01-01T00:00:00Z'), periodEnd: new Date('2026-02-01T00:00:00Z'), actorUserId: null,
      });
      expect(Number(propA.totalEarningsAmount)).toBe(500);
    });

    it('cash already covered by a remittance is reflected in totalCashRemittedAmount/totalCashOutstandingAmount', async () => {
      const hub = await mkSuperAgent();
      const c1 = await mkCashCollection({ superAgentId: hub.id, amount: 1000, createdAt: new Date('2026-01-05T00:00:00Z') });
      await remittanceService.recordRemittance({
        superAgentId: hub.id, currency: 'TZS', cashCollectionIds: [c1.id],
        actorUserId: 1, idempotencyKey: `remit-${++idemSeq}`,
      });

      const proposal = await settlementService.createSettlementProposal({
        superAgentId: hub.id, currency: 'TZS',
        periodStart: new Date('2026-01-01T00:00:00Z'), periodEnd: new Date('2026-02-01T00:00:00Z'), actorUserId: null,
      });
      expect(Number(proposal.totalCashCollectedAmount)).toBe(1000);
      expect(Number(proposal.totalCashRemittedAmount)).toBe(1000);
      expect(Number(proposal.totalCashOutstandingAmount)).toBe(0);
    });

    it('the settlement proposal and its membership rows are immutable', async () => {
      const hub = await mkSuperAgent();
      await mkEarning({ superAgentId: hub.id, amount: 500, createdAt: new Date('2026-01-05T00:00:00Z') });
      const proposal = await settlementService.createSettlementProposal({
        superAgentId: hub.id, currency: 'TZS',
        periodStart: new Date('2026-01-01T00:00:00Z'), periodEnd: new Date('2026-02-01T00:00:00Z'), actorUserId: null,
      });
      await expect(ds.query(`UPDATE public.super_agent_settlement_proposal SET "hasDiscrepancy" = true WHERE id = $1`, [proposal.id])).rejects.toThrow();
      await expect(ds.query(`DELETE FROM public.super_agent_settlement_proposal WHERE id = $1`, [proposal.id])).rejects.toThrow();
      const member = await ds.query(`SELECT id FROM public.super_agent_settlement_earning_member WHERE "settlementProposalId" = $1`, [proposal.id]);
      await expect(ds.query(`DELETE FROM public.super_agent_settlement_earning_member WHERE id = $1`, [member[0].id])).rejects.toThrow();
    });
  });

  // ── Part B-A: cash remittance ─────────────────────────────────────────
  describe('Part B-A: SuperAgentCashRemittanceService', () => {
    it('records a full-allocation remittance covering multiple collections, amount derived (not caller-supplied)', async () => {
      const hub = await mkSuperAgent();
      const c1 = await mkCashCollection({ superAgentId: hub.id, amount: 600 });
      const c2 = await mkCashCollection({ superAgentId: hub.id, amount: 400 });

      const remittance = await remittanceService.recordRemittance({
        superAgentId: hub.id, currency: 'TZS', cashCollectionIds: [c1.id, c2.id],
        actorUserId: 1, idempotencyKey: `remit-${++idemSeq}`, evidenceRef: 'ref-1',
      });
      expect(Number(remittance.amount)).toBe(1000);

      const allocations = await ds.query(`SELECT "cashCollectionId", "allocatedAmount" FROM public.super_agent_cash_remittance_allocation WHERE "remittanceId" = $1 ORDER BY "cashCollectionId"`, [remittance.id]);
      expect(allocations).toHaveLength(2);
      expect(Number(allocations[0].allocatedAmount)).toBe(600);
      expect(Number(allocations[1].allocatedAmount)).toBe(400);
    });

    it('is idempotent on a retried idempotencyKey -- returns the SAME remittance, never a second one', async () => {
      const hub = await mkSuperAgent();
      const c1 = await mkCashCollection({ superAgentId: hub.id, amount: 500 });
      const key = `remit-${++idemSeq}`;
      const first = await remittanceService.recordRemittance({ superAgentId: hub.id, currency: 'TZS', cashCollectionIds: [c1.id], actorUserId: 1, idempotencyKey: key });
      const second = await remittanceService.recordRemittance({ superAgentId: hub.id, currency: 'TZS', cashCollectionIds: [c1.id], actorUserId: 1, idempotencyKey: key });
      expect(second.id).toBe(first.id);
      expect(await remittanceRepo.count()).toBe(1);
    });

    it('rejects over-allocation: a collection already allocated to a different remittance can never be allocated again, and the WHOLE new remittance is refused (no partial remittance)', async () => {
      const hub = await mkSuperAgent();
      const c1 = await mkCashCollection({ superAgentId: hub.id, amount: 500 });
      const c2 = await mkCashCollection({ superAgentId: hub.id, amount: 300 });
      await remittanceService.recordRemittance({ superAgentId: hub.id, currency: 'TZS', cashCollectionIds: [c1.id], actorUserId: 1, idempotencyKey: `remit-${++idemSeq}` });

      await expect(remittanceService.recordRemittance({
        superAgentId: hub.id, currency: 'TZS', cashCollectionIds: [c1.id, c2.id], actorUserId: 1, idempotencyKey: `remit-${++idemSeq}`,
      })).rejects.toThrow(ConflictException);

      // c2 was NOT remitted either -- the whole attempt aborted atomically.
      const c2Alloc = await ds.query(`SELECT id FROM public.super_agent_cash_remittance_allocation WHERE "cashCollectionId" = $1`, [c2.id]);
      expect(c2Alloc).toHaveLength(0);
    });

    it('rejects scope ownership violations and currency mismatches', async () => {
      const hubA = await mkSuperAgent();
      const hubB = await mkSuperAgent();
      const cForB = await mkCashCollection({ superAgentId: hubB.id, amount: 500 });
      await expect(remittanceService.recordRemittance({
        superAgentId: hubA.id, currency: 'TZS', cashCollectionIds: [cForB.id], actorUserId: 1, idempotencyKey: `remit-${++idemSeq}`,
      })).rejects.toThrow(BadRequestException);

      const usdCollection = await mkCashCollection({ superAgentId: hubA.id, amount: 500, currency: 'USD' });
      await expect(remittanceService.recordRemittance({
        superAgentId: hubA.id, currency: 'TZS', cashCollectionIds: [usdCollection.id], actorUserId: 1, idempotencyKey: `remit-${++idemSeq}`,
      })).rejects.toThrow(BadRequestException);
    });

    it('concurrent remittance attempts for overlapping collections never both succeed', async () => {
      const hub = await mkSuperAgent();
      const c1 = await mkCashCollection({ superAgentId: hub.id, amount: 500 });

      const results = await Promise.allSettled([
        remittanceService.recordRemittance({ superAgentId: hub.id, currency: 'TZS', cashCollectionIds: [c1.id], actorUserId: 1, idempotencyKey: `remit-${++idemSeq}` }),
        remittanceService.recordRemittance({ superAgentId: hub.id, currency: 'TZS', cashCollectionIds: [c1.id], actorUserId: 1, idempotencyKey: `remit-${++idemSeq}` }),
      ]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const allocs = await ds.query(`SELECT id FROM public.super_agent_cash_remittance_allocation WHERE "cashCollectionId" = $1`, [c1.id]);
      expect(allocs).toHaveLength(1); // allocated exactly once
    });

    it('the remittance and its allocation rows are immutable', async () => {
      const hub = await mkSuperAgent();
      const c1 = await mkCashCollection({ superAgentId: hub.id, amount: 500 });
      const remittance = await remittanceService.recordRemittance({ superAgentId: hub.id, currency: 'TZS', cashCollectionIds: [c1.id], actorUserId: 1, idempotencyKey: `remit-${++idemSeq}` });
      await expect(ds.query(`UPDATE public.super_agent_cash_remittance SET amount = 1 WHERE id = $1`, [remittance.id])).rejects.toThrow();
      await expect(ds.query(`DELETE FROM public.super_agent_cash_remittance WHERE id = $1`, [remittance.id])).rejects.toThrow();
    });
  });

  // ── Wallet resolver: getOrCreateSuperAgentWallet ────────────────────────
  describe('WalletService.getOrCreateSuperAgentWallet', () => {
    it('is idempotent: repeated calls for the same Super Agent return the SAME wallet, never a second one', async () => {
      const hub = await mkSuperAgent();
      const w1 = await walletService.getOrCreateSuperAgentWallet(hub.id);
      const w2 = await walletService.getOrCreateSuperAgentWallet(hub.id);
      expect(w2.id).toBe(w1.id);
      const rows = await walletRepo.find({ where: { superAgentId: hub.id } as any });
      expect(rows).toHaveLength(1);
    });

    it('is concurrency-safe: parallel first-calls for the same Super Agent never create two wallets', async () => {
      const hub = await mkSuperAgent();
      const results = await Promise.all([
        walletService.getOrCreateSuperAgentWallet(hub.id),
        walletService.getOrCreateSuperAgentWallet(hub.id),
        walletService.getOrCreateSuperAgentWallet(hub.id),
      ]);
      const ids = new Set(results.map((w) => w.id));
      expect(ids.size).toBe(1);
      const rows = await walletRepo.find({ where: { superAgentId: hub.id } as any });
      expect(rows).toHaveLength(1);
    });

    it('two different Super Agents get two different wallets, each satisfying the 3-way ownership CHECK', async () => {
      const hubA = await mkSuperAgent();
      const hubB = await mkSuperAgent();
      const wA = await walletService.getOrCreateSuperAgentWallet(hubA.id);
      const wB = await walletService.getOrCreateSuperAgentWallet(hubB.id);
      expect(wA.id).not.toBe(wB.id);
      const row = await ds.query(`SELECT "userId", "workspaceId", "superAgentId" FROM public.wallet WHERE id = $1`, [wA.id]);
      expect(row[0].userId).toBeNull();
      expect(row[0].workspaceId).toBeNull();
      expect(row[0].superAgentId).toBe(hubA.id);
    });

    it('rejects an unknown Super Agent', async () => {
      await expect(walletService.getOrCreateSuperAgentWallet(999999)).rejects.toThrow(NotFoundException);
    });

    it('a direct raw attempt to set two owner columns on one wallet row violates the 3-way CHECK', async () => {
      const hub = await mkSuperAgent();
      const u = await ds.getRepository(User).save(ds.getRepository(User).create({
        email: `c7-dual-${++userSeq}@s3sc7.local`, phone: `+2558${String(userSeq).padStart(8, '0')}`, password: 'x', name: 'U',
      } as any));
      await expect(ds.query(
        `INSERT INTO public.wallet ("userId", "superAgentId") VALUES ($1, $2)`,
        [(u as any).id, hub.id],
      )).rejects.toThrow();
    });
  });

  // ── Part B-B: commission payout ─────────────────────────────────────────
  describe('Part B-B: SuperAgentHandlingEarningPayoutService', () => {
    it('is blocked when the settlement scope has unresolved cash exposure', async () => {
      const hub = await mkSuperAgent();
      await mkEarning({ superAgentId: hub.id, amount: 500, createdAt: new Date('2026-01-05T00:00:00Z') });
      await mkCashCollection({ superAgentId: hub.id, amount: 1000, createdAt: new Date('2026-01-05T00:00:00Z') }); // never remitted
      const proposal = await settlementService.createSettlementProposal({
        superAgentId: hub.id, currency: 'TZS',
        periodStart: new Date('2026-01-01T00:00:00Z'), periodEnd: new Date('2026-02-01T00:00:00Z'), actorUserId: null,
      });
      expect(Number(proposal.totalCashOutstandingAmount)).toBe(1000);
      await expect(payoutService.payoutSettlement(proposal.id, { userId: 1 })).rejects.toThrow(ConflictException);
      // Nothing moved: no payout row, wallet never created.
      expect(await payoutRepo.count()).toBe(0);
      const wallets = await walletRepo.find({ where: { superAgentId: hub.id } as any });
      expect(wallets).toHaveLength(0);
    });

    // ── Correction (review verdict on 81582da): payout eligibility must be
    // LIVE, not the proposal's own frozen totalCashOutstandingAmount -- a
    // settlement created before its cash is remitted must become payable
    // once that exact claimed cash is later, genuinely remitted, without
    // ever mutating the frozen proposal row.
    describe('correction: live cash-reconciliation payout gate', () => {
      it('a settlement blocked by outstanding cash becomes payable once its exact claimed collections are later remitted, without mutating the frozen historical total', async () => {
        const hub = await mkSuperAgent();
        await mkEarning({ superAgentId: hub.id, amount: 500, createdAt: new Date('2026-01-05T00:00:00Z') });
        const c1 = await mkCashCollection({ superAgentId: hub.id, amount: 1000, createdAt: new Date('2026-01-05T00:00:00Z') });
        const proposal = await settlementService.createSettlementProposal({
          superAgentId: hub.id, currency: 'TZS',
          periodStart: new Date('2026-01-01T00:00:00Z'), periodEnd: new Date('2026-02-01T00:00:00Z'), actorUserId: null,
        });
        expect(Number(proposal.totalCashOutstandingAmount)).toBe(1000); // frozen at creation

        // (1) blocked while outstanding.
        await expect(payoutService.payoutSettlement(proposal.id, { userId: 1 })).rejects.toThrow(ConflictException);

        // (2) remit the EXACT claimed collection AFTER proposal creation.
        await remittanceService.recordRemittance({
          superAgentId: hub.id, currency: 'TZS', cashCollectionIds: [c1.id], actorUserId: 1, idempotencyKey: `remit-${++idemSeq}`,
        });

        const payout = await payoutService.payoutSettlement(proposal.id, { userId: 1 });
        expect(Number(payout.amount)).toBe(500);

        // (3) retry on the SAME proposal succeeds exactly once.
        const retried = await payoutService.payoutSettlement(proposal.id, { userId: 1 });
        expect(retried.id).toBe(payout.id);
        expect(await payoutRepo.count()).toBe(1);
        const wallet = await walletRepo.findOneOrFail({ where: { superAgentId: hub.id } as any });
        expect(Number(wallet.balance)).toBe(500); // credited exactly once despite two calls

        // (7) the ORIGINAL frozen total is untouched -- historical audit
        // state at proposal creation, never rewritten.
        const refetched = await settlementService.findProposalById(proposal.id);
        expect(Number(refetched!.totalCashOutstandingAmount)).toBe(1000);
      });

      it('(4) remitting an unrelated cash collection does not unblock a different, still-unresolved settlement', async () => {
        const hub = await mkSuperAgent();
        await mkEarning({ superAgentId: hub.id, amount: 500, createdAt: new Date('2026-01-05T00:00:00Z') });
        await mkCashCollection({ superAgentId: hub.id, amount: 1000, createdAt: new Date('2026-01-05T00:00:00Z') }); // claimed, never remitted
        const proposal = await settlementService.createSettlementProposal({
          superAgentId: hub.id, currency: 'TZS',
          periodStart: new Date('2026-01-01T00:00:00Z'), periodEnd: new Date('2026-02-01T00:00:00Z'), actorUserId: null,
        });

        const unrelated = await mkCashCollection({ superAgentId: hub.id, amount: 400, createdAt: new Date('2026-03-05T00:00:00Z') }); // outside this proposal's period -- never claimed by it
        await remittanceService.recordRemittance({
          superAgentId: hub.id, currency: 'TZS', cashCollectionIds: [unrelated.id], actorUserId: 1, idempotencyKey: `remit-${++idemSeq}`,
        });

        await expect(payoutService.payoutSettlement(proposal.id, { userId: 1 })).rejects.toThrow(ConflictException);
      });

      it('(5) a partially-remitted claimed cash-member set remains blocked until every member is resolved', async () => {
        const hub = await mkSuperAgent();
        await mkEarning({ superAgentId: hub.id, amount: 500, createdAt: new Date('2026-01-05T00:00:00Z') });
        const c1 = await mkCashCollection({ superAgentId: hub.id, amount: 600, createdAt: new Date('2026-01-05T00:00:00Z') });
        const c2 = await mkCashCollection({ superAgentId: hub.id, amount: 400, createdAt: new Date('2026-01-06T00:00:00Z') });
        const proposal = await settlementService.createSettlementProposal({
          superAgentId: hub.id, currency: 'TZS',
          periodStart: new Date('2026-01-01T00:00:00Z'), periodEnd: new Date('2026-02-01T00:00:00Z'), actorUserId: null,
        }); // claims both c1 and c2

        await remittanceService.recordRemittance({
          superAgentId: hub.id, currency: 'TZS', cashCollectionIds: [c1.id], actorUserId: 1, idempotencyKey: `remit-${++idemSeq}`,
        }); // only c1 resolved
        await expect(payoutService.payoutSettlement(proposal.id, { userId: 1 })).rejects.toThrow(ConflictException);

        await remittanceService.recordRemittance({
          superAgentId: hub.id, currency: 'TZS', cashCollectionIds: [c2.id], actorUserId: 1, idempotencyKey: `remit-${++idemSeq}`,
        }); // now c2 too -- fully resolved
        const payout = await payoutService.payoutSettlement(proposal.id, { userId: 1 });
        expect(Number(payout.amount)).toBe(500);
      });

      it('(6) a concurrent remittance/payout race never credits before every required allocation has committed', async () => {
        const hub = await mkSuperAgent();
        await mkEarning({ superAgentId: hub.id, amount: 500, createdAt: new Date('2026-01-05T00:00:00Z') });
        const c1 = await mkCashCollection({ superAgentId: hub.id, amount: 1000, createdAt: new Date('2026-01-05T00:00:00Z') });
        const proposal = await settlementService.createSettlementProposal({
          superAgentId: hub.id, currency: 'TZS',
          periodStart: new Date('2026-01-01T00:00:00Z'), periodEnd: new Date('2026-02-01T00:00:00Z'), actorUserId: null,
        });

        const [remitResult, payoutResult] = await Promise.allSettled([
          remittanceService.recordRemittance({ superAgentId: hub.id, currency: 'TZS', cashCollectionIds: [c1.id], actorUserId: 1, idempotencyKey: `remit-${++idemSeq}` }),
          payoutService.payoutSettlement(proposal.id, { userId: 1 }),
        ]);

        // The Super Agent row lock serializes the two transactions -- the
        // remittance always eventually succeeds (nothing conflicts with its
        // own uniqueness); the payout either succeeds (if it ran AFTER the
        // remittance committed) or is correctly blocked (if it ran BEFORE).
        // What must NEVER happen is a payout that both succeeded and left
        // the cash unremitted at that moment.
        expect(remitResult.status).toBe('fulfilled');
        if (payoutResult.status === 'rejected') {
          expect(payoutResult.reason).toBeInstanceOf(ConflictException);
          await payoutService.payoutSettlement(proposal.id, { userId: 1 }); // now resolved -- retry succeeds
        }

        expect(await payoutRepo.count()).toBe(1);
        const wallet = await walletRepo.findOneOrFail({ where: { superAgentId: hub.id } as any });
        expect(Number(wallet.balance)).toBe(500); // exactly once, never partial, never double
      });
    });

    it('succeeds when eligible: wallet balance and payout allocations commit atomically in one transaction', async () => {
      const hub = await mkSuperAgent();
      const e1 = await mkEarning({ superAgentId: hub.id, amount: 500, createdAt: new Date('2026-01-05T00:00:00Z') });
      const e2 = await mkEarning({ superAgentId: hub.id, amount: 300, createdAt: new Date('2026-01-06T00:00:00Z') });
      const c1 = await mkCashCollection({ superAgentId: hub.id, amount: 1000, createdAt: new Date('2026-01-05T00:00:00Z') });
      await remittanceService.recordRemittance({ superAgentId: hub.id, currency: 'TZS', cashCollectionIds: [c1.id], actorUserId: 1, idempotencyKey: `remit-${++idemSeq}` });
      const proposal = await settlementService.createSettlementProposal({
        superAgentId: hub.id, currency: 'TZS',
        periodStart: new Date('2026-01-01T00:00:00Z'), periodEnd: new Date('2026-02-01T00:00:00Z'), actorUserId: null,
      });
      expect(Number(proposal.totalCashOutstandingAmount)).toBe(0);

      const payout = await payoutService.payoutSettlement(proposal.id, { userId: 1 });
      expect(Number(payout.amount)).toBe(800);

      const wallet = await walletRepo.findOneOrFail({ where: { superAgentId: hub.id } as any });
      expect(Number(wallet.balance)).toBe(800);

      const tx = await walletTxRepo.findOneOrFail({ where: { id: payout.walletTransactionId } as any });
      expect(tx.type).toBe(WalletTransactionType.SUPER_AGENT_COMMISSION_PAYOUT);

      const allocations = await ds.query(`SELECT "earningId" FROM public.super_agent_handling_earning_payout_allocation WHERE "payoutId" = $1 ORDER BY "earningId"`, [payout.id]);
      expect(allocations.map((a: any) => a.earningId).sort()).toEqual([e1.id, e2.id].sort());
    });

    it('failure after the wallet credit cannot leave the payout ledger inconsistent -- the whole transaction rolls back', async () => {
      const hub = await mkSuperAgent();
      await mkEarning({ superAgentId: hub.id, amount: 500, createdAt: new Date('2026-01-05T00:00:00Z') });
      const proposal = await settlementService.createSettlementProposal({
        superAgentId: hub.id, currency: 'TZS',
        periodStart: new Date('2026-01-01T00:00:00Z'), periodEnd: new Date('2026-02-01T00:00:00Z'), actorUserId: null,
      });

      // Pre-create a wallet AND a payout row occupying the unique slot this
      // call will try to insert into AFTER crediting -- forces the credit to
      // happen, then the payout insert to fail on the real UNIQUE
      // constraint, proving the credit itself is rolled back with it.
      const wallet = await walletService.getOrCreateSuperAgentWallet(hub.id);
      // walletTransactionId has no FK (a deliberate plain-column, per this
      // lineage's own cross-module convention) -- any placeholder int
      // satisfies its NOT NULL without needing a real WalletTransaction row.
      await ds.query(
        `INSERT INTO public.super_agent_handling_earning_payout ("settlementProposalId", "superAgentId", currency, amount, "walletTransactionId", "actorUserId") VALUES ($1, $2, $3, $4, $5, NULL)`,
        [proposal.id, hub.id, 'TZS', 1, 999999],
      );

      await expect(payoutService.payoutSettlement(proposal.id, { userId: 1 })).resolves.toBeDefined(); // idempotent catch-and-reselect path
      const after = await walletRepo.findOneOrFail({ where: { id: wallet.id } as any });
      // The credit from payoutSettlement's OWN attempt was rolled back by the
      // unique-violation on its own insert; balance reflects only the
      // pre-existing state (zero), never a second, orphaned credit.
      expect(Number(after.balance)).toBe(0);
      expect(await payoutRepo.count()).toBe(1); // still just the pre-seeded row, no duplicate
    });

    it('concurrent/retried payouts for the same settlement credit exactly once', async () => {
      const hub = await mkSuperAgent();
      await mkEarning({ superAgentId: hub.id, amount: 500, createdAt: new Date('2026-01-05T00:00:00Z') });
      const proposal = await settlementService.createSettlementProposal({
        superAgentId: hub.id, currency: 'TZS',
        periodStart: new Date('2026-01-01T00:00:00Z'), periodEnd: new Date('2026-02-01T00:00:00Z'), actorUserId: null,
      });

      const results = await Promise.all([
        payoutService.payoutSettlement(proposal.id, { userId: 1 }),
        payoutService.payoutSettlement(proposal.id, { userId: 1 }),
        payoutService.payoutSettlement(proposal.id, { userId: 1 }),
      ]);
      const ids = new Set(results.map((p) => p.id));
      expect(ids.size).toBe(1);
      expect(await payoutRepo.count()).toBe(1);
      const wallet = await walletRepo.findOneOrFail({ where: { superAgentId: hub.id } as any });
      expect(Number(wallet.balance)).toBe(500); // credited exactly once, not 3 times
    });

    it('the payout and its allocation rows are immutable', async () => {
      const hub = await mkSuperAgent();
      await mkEarning({ superAgentId: hub.id, amount: 500, createdAt: new Date('2026-01-05T00:00:00Z') });
      const proposal = await settlementService.createSettlementProposal({
        superAgentId: hub.id, currency: 'TZS',
        periodStart: new Date('2026-01-01T00:00:00Z'), periodEnd: new Date('2026-02-01T00:00:00Z'), actorUserId: null,
      });
      const payout = await payoutService.payoutSettlement(proposal.id, { userId: 1 });
      await expect(ds.query(`UPDATE public.super_agent_handling_earning_payout SET amount = 1 WHERE id = $1`, [payout.id])).rejects.toThrow();
      await expect(ds.query(`DELETE FROM public.super_agent_handling_earning_payout WHERE id = $1`, [payout.id])).rejects.toThrow();
      const alloc = await ds.query(`SELECT id FROM public.super_agent_handling_earning_payout_allocation WHERE "payoutId" = $1`, [payout.id]);
      await expect(ds.query(`DELETE FROM public.super_agent_handling_earning_payout_allocation WHERE id = $1`, [alloc[0].id])).rejects.toThrow();
    });
  });

  // ── Non-interference with pre-existing financial state ──────────────────
  describe('Non-interference: legacy Super Agent earning fields and COD accounting', () => {
    it('never mutates SuperAgent.totalEarnings/pendingEarnings/withdrawableEarnings/commissionRate, nor codCashHeld/outstandingBalance', async () => {
      const hub = await mkSuperAgent();
      await ds.query(
        `UPDATE public.super_agent SET "totalEarnings" = 111, "pendingEarnings" = 222, "withdrawableEarnings" = 333, "commissionRate" = 0.07, "codCashHeld" = 444, "outstandingBalance" = 555 WHERE id = $1`,
        [hub.id],
      );

      await mkEarning({ superAgentId: hub.id, amount: 500, createdAt: new Date('2026-01-05T00:00:00Z') });
      const c1 = await mkCashCollection({ superAgentId: hub.id, amount: 1000, createdAt: new Date('2026-01-05T00:00:00Z') });
      await remittanceService.recordRemittance({ superAgentId: hub.id, currency: 'TZS', cashCollectionIds: [c1.id], actorUserId: 1, idempotencyKey: `remit-${++idemSeq}` });
      const proposal = await settlementService.createSettlementProposal({
        superAgentId: hub.id, currency: 'TZS',
        periodStart: new Date('2026-01-01T00:00:00Z'), periodEnd: new Date('2026-02-01T00:00:00Z'), actorUserId: null,
      });
      await payoutService.payoutSettlement(proposal.id, { userId: 1 });

      const after = await ds.query(
        `SELECT "totalEarnings", "pendingEarnings", "withdrawableEarnings", "commissionRate", "codCashHeld", "outstandingBalance" FROM public.super_agent WHERE id = $1`,
        [hub.id],
      );
      expect(Number(after[0].totalEarnings)).toBe(111);
      expect(Number(after[0].pendingEarnings)).toBe(222);
      expect(Number(after[0].withdrawableEarnings)).toBe(333);
      expect(Number(after[0].commissionRate)).toBe(0.07);
      expect(Number(after[0].codCashHeld)).toBe(444);
      expect(Number(after[0].outstandingBalance)).toBe(555);
    });
  });
});
