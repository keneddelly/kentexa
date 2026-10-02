import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../../business/b5b-closure-test-db';
import { AddSuperAgentSettlementFoundation1788288600000 } from './1788288600000-AddSuperAgentSettlementFoundation';

/**
 * Stage 3S-C7 migration-level proof: the RAW SQL this migration writes,
 * applied directly against a minimal hand-stubbed prerequisite schema
 * (mirroring add-super-agent-commission-foundation.real-postgres.spec.ts's
 * own established "stub the upstream tables this migration FKs into,
 * don't replay the whole real migration chain" convention) -- CHECK vocab,
 * FK shape, UNIQUE constraints, immutability triggers, and idempotent
 * up/guarded-down, independent of whatever the service layer happens to
 * call.
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('Stage 3S-C7 settlement foundation schema: real PostgreSQL', () => {
  jest.setTimeout(120000);
  let ds: DataSource;
  const migration = new AddSuperAgentSettlementFoundation1788288600000();
  const apply = async (direction: 'up' | 'down') => {
    const runner = ds.createQueryRunner();
    await runner.startTransaction();
    try {
      await migration[direction](runner);
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  };

  const freshPrereqs = async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    // Minimal stand-ins for the real, already-deployed upstream tables this
    // migration ALTERs/FKs into -- enough shape to prove C7's own SQL, not a
    // replay of the I2G/C5 migrations themselves.
    await ds.query(`CREATE TABLE public.super_agent (id SERIAL PRIMARY KEY)`);
    await ds.query(`INSERT INTO public.super_agent VALUES (1),(2)`);
    await ds.query(`CREATE TABLE public.wallet (
      id SERIAL PRIMARY KEY, "userId" integer, "workspaceId" integer,
      balance decimal(12,2) NOT NULL DEFAULT 0, "totalEarned" decimal(12,2) NOT NULL DEFAULT 0,
      "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
      CONSTRAINT "CK_wallet_exactly_one_owner" CHECK (("userId" IS NOT NULL AND "workspaceId" IS NULL) OR ("userId" IS NULL AND "workspaceId" IS NOT NULL))
    )`);
    await ds.query(`CREATE TABLE public.wallet_transaction (id SERIAL PRIMARY KEY, "walletId" integer NOT NULL)`);
    await ds.query(`INSERT INTO public.wallet_transaction ("walletId") VALUES (1),(1)`);
    await ds.query(`CREATE TABLE public.parcel_custody_event (id SERIAL PRIMARY KEY)`);
    await ds.query(`INSERT INTO public.parcel_custody_event VALUES (1),(2)`);
    await ds.query(`CREATE TABLE public.super_agent_handling_rate (id SERIAL PRIMARY KEY)`);
    await ds.query(`INSERT INTO public.super_agent_handling_rate VALUES (1)`);
    await ds.query(`CREATE TABLE public.super_agent_handling_earning (
      id SERIAL PRIMARY KEY, "custodyEventId" integer NOT NULL REFERENCES public.parcel_custody_event(id),
      "rateConfigId" integer NOT NULL REFERENCES public.super_agent_handling_rate(id), "superAgentId" integer NOT NULL
    )`);
    await ds.query(`CREATE TABLE public.super_agent_cash_collection (id SERIAL PRIMARY KEY, "superAgentId" integer NOT NULL)`);
  };

  const insertWallet = (superAgentId: number | null) =>
    ds.query(`INSERT INTO public.wallet ("userId","workspaceId","superAgentId") VALUES (NULL, NULL, $1) RETURNING id`, [superAgentId]);
  const insertEarning = (superAgentId = 1) =>
    ds.query(`INSERT INTO public.super_agent_handling_earning ("custodyEventId","rateConfigId","superAgentId") VALUES (1,1,$1) RETURNING id`, [superAgentId]);
  const insertCollection = (superAgentId = 1) =>
    ds.query(`INSERT INTO public.super_agent_cash_collection ("superAgentId") VALUES ($1) RETURNING id`, [superAgentId]);
  const insertProposal = (o: Partial<{ superAgentId: number; currency: string; periodStart: string; periodEnd: string }> = {}) =>
    ds.query(
      `INSERT INTO public.super_agent_settlement_proposal ("superAgentId", currency, "periodStart", "periodEnd")
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [o.superAgentId ?? 1, o.currency ?? 'TZS', o.periodStart ?? '2026-01-01', o.periodEnd ?? '2026-02-01'],
    );

  beforeAll(async () => {
    ds = new DataSource({
      type: 'postgres', host: config!.host, port: config!.port,
      username: config!.user, password: config!.password, database: config!.database,
      synchronize: false, entities: [],
    });
    await ds.initialize();
    await freshPrereqs();
  });
  afterAll(async () => { if (ds) await ds.destroy(); });

  it('extends the wallet CHECK to three owner types, idempotently, and enforces UQ_wallet_super_agent', async () => {
    await apply('up');
    await apply('up'); // idempotent

    await expect(ds.query(`INSERT INTO public.wallet ("userId","workspaceId","superAgentId") VALUES (1, 1, NULL)`)).rejects.toThrow(/CK_wallet_exactly_one_owner/);
    await expect(ds.query(`INSERT INTO public.wallet ("userId","workspaceId","superAgentId") VALUES (NULL, NULL, NULL)`)).rejects.toThrow(/CK_wallet_exactly_one_owner/);
    await expect(ds.query(`INSERT INTO public.wallet ("userId","workspaceId","superAgentId") VALUES (1, NULL, 1)`)).rejects.toThrow(/CK_wallet_exactly_one_owner/);

    const [w] = await insertWallet(1);
    await expect(insertWallet(1)).rejects.toThrow(/UQ_wallet_super_agent/);
    await expect(insertWallet(2)).resolves.toHaveLength(1); // a different Super Agent is fine
    await expect(ds.query(`INSERT INTO public.wallet ("userId","workspaceId","superAgentId") VALUES (NULL, NULL, 999)`)).rejects.toThrow(/violates foreign key/i);

    await ds.query(`DELETE FROM public.wallet WHERE id = $1`, [w.id]);
  });

  it('settlement proposal: status/period/nonnegative CHECKs and immutability', async () => {
    await expect(insertProposal({ periodStart: '2026-02-01', periodEnd: '2026-01-01' })).rejects.toThrow(/CHK_super_agent_settlement_proposal_period/);
    await expect(ds.query(`INSERT INTO public.super_agent_settlement_proposal ("superAgentId", currency, "periodStart", "periodEnd", status) VALUES (1,'TZS','2026-01-01','2026-02-01','draft')`))
      .rejects.toThrow(/CHK_super_agent_settlement_proposal_status/);
    await expect(ds.query(`INSERT INTO public.super_agent_settlement_proposal ("superAgentId", currency, "periodStart", "periodEnd", "totalEarningsAmount") VALUES (1,'TZS','2026-01-01','2026-02-01',-1)`))
      .rejects.toThrow(/CHK_super_agent_settlement_proposal_nonnegative/);

    const [p] = await insertProposal();
    await expect(ds.query(`UPDATE public.super_agent_settlement_proposal SET "hasDiscrepancy"=true WHERE id=$1`, [p.id])).rejects.toThrow(/immutable/);
    await expect(ds.query(`DELETE FROM public.super_agent_settlement_proposal WHERE id=$1`, [p.id])).rejects.toThrow(/immutable/);
  });

  it('settlement membership tables: FK shape and GLOBAL uniqueness (the no-double-counting authority)', async () => {
    const [p1] = await insertProposal();
    const [p2] = await insertProposal({ periodStart: '2026-02-01', periodEnd: '2026-03-01' });
    const [e] = await insertEarning();
    const [c] = await insertCollection();

    await expect(ds.query(`INSERT INTO public.super_agent_settlement_earning_member ("settlementProposalId","earningId") VALUES ($1, 999999)`, [p1.id]))
      .rejects.toThrow(/violates foreign key/i);
    await ds.query(`INSERT INTO public.super_agent_settlement_earning_member ("settlementProposalId","earningId") VALUES ($1, $2)`, [p1.id, e.id]);
    await expect(ds.query(`INSERT INTO public.super_agent_settlement_earning_member ("settlementProposalId","earningId") VALUES ($1, $2)`, [p2.id, e.id]))
      .rejects.toThrow(/UQ_super_agent_settlement_earning_member/); // same earning, a DIFFERENT settlement -- still rejected

    await ds.query(`INSERT INTO public.super_agent_settlement_cash_collection_member ("settlementProposalId","cashCollectionId") VALUES ($1, $2)`, [p1.id, c.id]);
    await expect(ds.query(`INSERT INTO public.super_agent_settlement_cash_collection_member ("settlementProposalId","cashCollectionId") VALUES ($1, $2)`, [p2.id, c.id]))
      .rejects.toThrow(/UQ_super_agent_settlement_cash_collection_member/);

    const [memberRow] = await ds.query(`SELECT id FROM public.super_agent_settlement_earning_member WHERE "earningId" = $1`, [e.id]);
    await expect(ds.query(`DELETE FROM public.super_agent_settlement_earning_member WHERE id=$1`, [memberRow.id])).rejects.toThrow(/immutable/);
  });

  it('cash remittance: idempotency key uniqueness, positive-amount CHECK, immutability', async () => {
    await expect(ds.query(
      `INSERT INTO public.super_agent_cash_remittance ("superAgentId", currency, amount, "actorUserId", "idempotencyKey") VALUES (1,'TZS',0,1,'r-amt')`,
    )).rejects.toThrow(/CHK_super_agent_cash_remittance_amount_positive/);

    const [r] = await ds.query(
      `INSERT INTO public.super_agent_cash_remittance ("superAgentId", currency, amount, "actorUserId", "idempotencyKey") VALUES (1,'TZS',500,1,'r-1') RETURNING id`,
    );
    await expect(ds.query(
      `INSERT INTO public.super_agent_cash_remittance ("superAgentId", currency, amount, "actorUserId", "idempotencyKey") VALUES (1,'TZS',500,1,'r-1')`,
    )).rejects.toThrow(/UQ_super_agent_cash_remittance_idempotency/);

    await expect(ds.query(`UPDATE public.super_agent_cash_remittance SET amount=1 WHERE id=$1`, [r.id])).rejects.toThrow(/immutable/);
    await expect(ds.query(`DELETE FROM public.super_agent_cash_remittance WHERE id=$1`, [r.id])).rejects.toThrow(/immutable/);

    const [c1] = await insertCollection();
    const [c2] = await insertCollection();
    await expect(ds.query(
      `INSERT INTO public.super_agent_cash_remittance_allocation ("remittanceId","cashCollectionId","allocatedAmount") VALUES ($1,$2,0)`,
      [r.id, c1.id],
    )).rejects.toThrow(/CHK_super_agent_cash_remittance_allocation_amount_positive/);
    await ds.query(`INSERT INTO public.super_agent_cash_remittance_allocation ("remittanceId","cashCollectionId","allocatedAmount") VALUES ($1,$2,500)`, [r.id, c1.id]);
    const [r2] = await ds.query(
      `INSERT INTO public.super_agent_cash_remittance ("superAgentId", currency, amount, "actorUserId", "idempotencyKey") VALUES (1,'TZS',300,1,'r-2') RETURNING id`,
    );
    await expect(ds.query(
      `INSERT INTO public.super_agent_cash_remittance_allocation ("remittanceId","cashCollectionId","allocatedAmount") VALUES ($1,$2,500)`,
      [r2.id, c1.id],
    )).rejects.toThrow(/UQ_super_agent_cash_remittance_allocation_collection/); // c1 already allocated -- even to a DIFFERENT remittance
    await expect(ds.query(
      `INSERT INTO public.super_agent_cash_remittance_allocation ("remittanceId","cashCollectionId","allocatedAmount") VALUES ($1,$2,300) RETURNING id`,
      [r2.id, c2.id],
    )).resolves.toHaveLength(1); // a different collection is fine
  });

  it('earning payout: one payout per settlement, one allocation per earning, positive-amount CHECK, immutability', async () => {
    const [p] = await insertProposal({ periodStart: '2026-03-01', periodEnd: '2026-04-01' });
    const [txRow] = await ds.query(`INSERT INTO public.wallet_transaction ("walletId") VALUES (1) RETURNING id`);

    await expect(ds.query(
      `INSERT INTO public.super_agent_handling_earning_payout ("settlementProposalId","superAgentId",currency,amount,"walletTransactionId") VALUES ($1,1,'TZS',0,$2)`,
      [p.id, txRow.id],
    )).rejects.toThrow(/CHK_super_agent_handling_earning_payout_amount_positive/);
    await expect(ds.query(
      `INSERT INTO public.super_agent_handling_earning_payout ("settlementProposalId","superAgentId",currency,amount,"walletTransactionId") VALUES ($1,1,'TZS',500,999999)`,
      [p.id],
    )).rejects.toThrow(/violates foreign key/i);

    const [payout] = await ds.query(
      `INSERT INTO public.super_agent_handling_earning_payout ("settlementProposalId","superAgentId",currency,amount,"walletTransactionId") VALUES ($1,1,'TZS',500,$2) RETURNING id`,
      [p.id, txRow.id],
    );
    await expect(ds.query(
      `INSERT INTO public.super_agent_handling_earning_payout ("settlementProposalId","superAgentId",currency,amount,"walletTransactionId") VALUES ($1,1,'TZS',500,$2)`,
      [p.id, txRow.id],
    )).rejects.toThrow(/UQ_super_agent_handling_earning_payout_settlement/);

    const [e1] = await insertEarning();
    await ds.query(`INSERT INTO public.super_agent_handling_earning_payout_allocation ("payoutId","earningId") VALUES ($1,$2)`, [payout.id, e1.id]);
    const [p2] = await insertProposal({ periodStart: '2026-04-01', periodEnd: '2026-05-01' });
    const [payout2] = await ds.query(
      `INSERT INTO public.super_agent_handling_earning_payout ("settlementProposalId","superAgentId",currency,amount,"walletTransactionId") VALUES ($1,1,'TZS',500,$2) RETURNING id`,
      [p2.id, txRow.id],
    );
    await expect(ds.query(
      `INSERT INTO public.super_agent_handling_earning_payout_allocation ("payoutId","earningId") VALUES ($1,$2)`,
      [payout2.id, e1.id],
    )).rejects.toThrow(/UQ_super_agent_handling_earning_payout_allocation_earning/); // same earning, a DIFFERENT payout

    await expect(ds.query(`UPDATE public.super_agent_handling_earning_payout SET amount=1 WHERE id=$1`, [payout.id])).rejects.toThrow(/immutable/);
    await expect(ds.query(`DELETE FROM public.super_agent_handling_earning_payout WHERE id=$1`, [payout.id])).rejects.toThrow(/immutable/);
  });

  it('refuses rollback while a Super Agent wallet exists, and leaves the schema intact', async () => {
    const [w] = await insertWallet(1);
    await expect(apply('down')).rejects.toThrow('Super Agent wallets exist');
    expect((await ds.query(`SELECT to_regclass('public.super_agent_settlement_proposal') AS t`))[0].t).not.toBeNull();
    await ds.query(`DELETE FROM public.wallet WHERE id = $1`, [w.id]);
  });

  it('an empty rollback round-trips cleanly, restoring the pre-C7 two-owner wallet CHECK', async () => {
    // Clear every Super-Agent-owned wallet left over from earlier tests in
    // this file (e.g. the superAgentId=2 row from the first test) -- down()
    // itself refuses to run while any exist.
    await ds.query(`DELETE FROM public.wallet WHERE "superAgentId" IS NOT NULL`);
    await apply('down');
    expect((await ds.query(`SELECT to_regclass('public.super_agent_settlement_proposal') AS t`))[0].t).toBeNull();
    expect((await ds.query(`SELECT to_regclass('public.super_agent_handling_earning_payout') AS t`))[0].t).toBeNull();
    const cols = await ds.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='wallet' AND column_name='superAgentId'`);
    expect(cols).toHaveLength(0);
    await expect(ds.query(`INSERT INTO public.wallet ("userId","workspaceId") VALUES (1, 1)`)).rejects.toThrow(/CK_wallet_exactly_one_owner/);
    await apply('up'); // leave the schema present for any later spec run in this file
  });
});
