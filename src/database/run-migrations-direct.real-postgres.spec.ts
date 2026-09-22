import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema, bootstrapB5BTestSchema, B5B_ALL_ENTITIES } from '../business/b5b-closure-test-db';
import { buildRunner, parseUpperBound } from './run-migrations-direct';
import { AddWorkspaceOwnershipToOrderAndSale1788264000000 } from './migrations/1788264000000-AddWorkspaceOwnershipToOrderAndSale';
import { AddWalletXorOwnership1788264600000 } from './migrations/1788264600000-AddWalletXorOwnership';
import { AddMoneyRoutingEntry1788265200000 } from './migrations/1788265200000-AddMoneyRoutingEntry';
import { AddPayoutDestination1788265800000 } from './migrations/1788265800000-AddPayoutDestination';
import { AddFinancialReconciliationJournal1788266400000 } from './migrations/1788266400000-AddFinancialReconciliationJournal';
import { HardenFinancialHistoryForeignKeys1788267000000 } from './migrations/1788267000000-HardenFinancialHistoryForeignKeys';

const config = getB5BTestConnectionConfig();
const describeIfDb = config ? describe : describe.skip;

/**
 * Gate H bounded migration runner — real-Postgres proof that a bounded run actually leaves the
 * excluded migration pending in the SAME typeorm_migrations ledger a later, unbounded run reads,
 * not merely that the pure selection function returns the right names (see
 * run-migrations-direct.spec.ts for that). This drives the REAL six I2G migration classes through
 * DataSource.runMigrations() via buildRunner() -- the exact function main() uses -- against a
 * disposable schema shaped like the tables those migrations actually touch.
 */
describeIfDb('run-migrations-direct — bounded runner against real Postgres', () => {
  let ds: DataSource;

  // DataSource's own `migrations` option takes CLASSES (it does `new migrationClass()` itself in
  // ConnectionMetadataBuilder.buildMigrations()) -- not instances.
  const ALL_SIX = () => [
    AddWorkspaceOwnershipToOrderAndSale1788264000000,
    AddWalletXorOwnership1788264600000,
    AddMoneyRoutingEntry1788265200000,
    AddPayoutDestination1788265800000,
    AddFinancialReconciliationJournal1788266400000,
    HardenFinancialHistoryForeignKeys1788267000000,
  ];

  const buildDataSource = () =>
    new DataSource({
      type: 'postgres',
      host: config!.host,
      port: config!.port,
      username: config!.user,
      password: config!.password,
      database: config!.database,
      synchronize: false,
      migrationsTableName: 'typeorm_migrations',
      migrations: ALL_SIX(),
    });

  beforeAll(async () => {
    if (!config) return;
    const client = new Client(config);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();
    await bootstrapB5BTestSchema(config); // user, operational_workspace, classified, business, ...

    const bootstrapDs = new DataSource({
      type: 'postgres', host: config.host, port: config.port, username: config.user,
      password: config.password, database: config.database, synchronize: false,
      entities: B5B_ALL_ENTITIES,
    });
    await bootstrapDs.initialize();
    const q = (sql: string, params: any[] = []) => bootstrapDs.query(sql, params);

    // The base tables the six I2G migrations expect to already exist, matching the pre-I2G
    // production shape -- same fixture SQL money-routing/i2g-release-harness.ts uses for the same
    // migrations, kept independent here so this test doesn't depend on that harness's own state.
    await q(`CREATE TABLE product (id serial PRIMARY KEY, "sellerId" int REFERENCES "user"(id) ON DELETE CASCADE, "workspaceId" int REFERENCES operational_workspace(id) ON DELETE SET NULL)`);
    await q(`CREATE TABLE "order" (
      id serial PRIMARY KEY, "sellerId" int, "productId" int REFERENCES product(id), "buyerId" int, source varchar,
      status varchar, "paymentStatus" varchar, "escrowStatus" varchar, "payoutStatus" varchar, "paymentMethod" varchar,
      "sellerAmount" numeric(12,2) NOT NULL DEFAULT 0, "totalAmount" numeric(12,2) NOT NULL DEFAULT 0, "codUpfrontAmount" numeric(12,2),
      "fundsReleasedAt" timestamp, "autoReleaseAt" timestamp)`);
    await q(`ALTER TABLE "order" ADD CONSTRAINT "FK_order_seller" FOREIGN KEY ("sellerId") REFERENCES "user"(id) ON DELETE SET NULL`);
    await q(`CREATE TABLE sale (id serial PRIMARY KEY, "sellerId" int NOT NULL, "createdAt" timestamp DEFAULT now())`);
    await q(`ALTER TABLE sale ADD CONSTRAINT "FK_sale_seller" FOREIGN KEY ("sellerId") REFERENCES "user"(id) ON DELETE CASCADE`);
    await q(`CREATE TABLE wallet (id serial PRIMARY KEY, "userId" int NOT NULL, balance numeric(12,2) NOT NULL DEFAULT 0, "pendingBalance" numeric(12,2) NOT NULL DEFAULT 0, "totalEarned" numeric(12,2) NOT NULL DEFAULT 0, "totalWithdrawn" numeric(12,2) NOT NULL DEFAULT 0)`);
    await q(`ALTER TABLE wallet ADD CONSTRAINT "UQ_wallet_user" UNIQUE ("userId")`);
    await q(`ALTER TABLE wallet ADD CONSTRAINT "FK_wallet_user_legacy" FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE`);
    await q(`CREATE TABLE wallet_transaction (id serial PRIMARY KEY, "walletId" int NOT NULL REFERENCES wallet(id) ON DELETE CASCADE, type varchar NOT NULL, amount numeric(12,2) NOT NULL, "balanceAfter" numeric(12,2) NOT NULL, "createdAt" timestamp NOT NULL DEFAULT now())`);
    await q(`CREATE TABLE payout (id serial PRIMARY KEY, "sellerId" int NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, "orderId" int REFERENCES "order"(id) ON DELETE CASCADE)`);
    await q(`CREATE TABLE invoice (id serial PRIMARY KEY, "orderId" int REFERENCES "order"(id) ON DELETE CASCADE, "buyerId" int REFERENCES "user"(id) ON DELETE CASCADE)`);
    await q(`CREATE TABLE classified_invoice_request (id serial PRIMARY KEY, "classifiedId" int REFERENCES classified(id) ON DELETE CASCADE, "sellerId" int REFERENCES "user"(id) ON DELETE CASCADE, "buyerId" int REFERENCES "user"(id) ON DELETE CASCADE)`);
    await bootstrapDs.destroy();
  }, 120000);

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
  });

  it('§0 disposable database reachable', () => expect(!!config).toBe(true));

  it('A/E: MIGRATION_RUN_UPTO=1788266400000 runs exactly migrations 1-5, leaves migration 6 genuinely pending in typeorm_migrations, and a later unbounded run picks up ONLY migration 6', async () => {
    if (!config) return;
    ds = buildDataSource();
    await ds.initialize();

    const upperBound = parseUpperBound('1788266400000');
    const { runner, owns, selection } = buildRunner(ds, upperBound);
    expect(selection.selected.map((m) => m.name)).toEqual([
      'AddWorkspaceOwnershipToOrderAndSale1788264000000',
      'AddWalletXorOwnership1788264600000',
      'AddMoneyRoutingEntry1788265200000',
      'AddPayoutDestination1788265800000',
      'AddFinancialReconciliationJournal1788266400000',
    ]);
    expect(selection.excluded.map((m) => m.name)).toEqual(['HardenFinancialHistoryForeignKeys1788267000000']);
    expect(owns).toBe(true); // a genuinely separate DataSource was built, ds.migrations itself untouched
    expect(ds.migrations).toHaveLength(6); // the original DataSource's own migrations array is unmutated

    await runner.initialize();
    const executed = await runner.runMigrations();
    expect(executed.map((m) => m.name)).toEqual([
      'AddWorkspaceOwnershipToOrderAndSale1788264000000',
      'AddWalletXorOwnership1788264600000',
      'AddMoneyRoutingEntry1788265200000',
      'AddPayoutDestination1788265800000',
      'AddFinancialReconciliationJournal1788266400000',
    ]);
    await runner.destroy();

    // The real ledger table, read independently of either DataSource's own bookkeeping.
    const ledger = await ds.query(`SELECT name FROM public.typeorm_migrations ORDER BY id`);
    const ledgerNames: string[] = ledger.map((r: any) => r.name);
    expect(ledgerNames).toEqual([
      'AddWorkspaceOwnershipToOrderAndSale1788264000000',
      'AddWalletXorOwnership1788264600000',
      'AddMoneyRoutingEntry1788265200000',
      'AddPayoutDestination1788265800000',
      'AddFinancialReconciliationJournal1788266400000',
    ]);
    expect(ledgerNames).not.toContain('HardenFinancialHistoryForeignKeys1788267000000');

    // Migration 6's own schema effects must NOT have happened -- order.sellerId is still SET NULL,
    // not RESTRICT (this is the actual, physical proof it never ran, not just an absent ledger row).
    const fk = await ds.query(`
      SELECT confdeltype FROM pg_constraint
       WHERE conrelid = 'public."order"'::regclass AND contype = 'f'
         AND conname = (SELECT c.conname FROM pg_constraint c
                          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
                         WHERE c.contype = 'f' AND c.conrelid = 'public."order"'::regclass AND a.attname = 'sellerId')`);
    expect(fk[0].confdeltype).toBe('n'); // 'n' = SET NULL (pre-migration-6); 'r' would mean RESTRICT already applied

    // A later, unbounded run against a DataSource holding all six classes discovers migration 6 as
    // the ONLY pending one -- proving it was never faked/marked executed, genuinely still pending.
    const dsUnbounded = buildDataSource();
    await dsUnbounded.initialize();
    const { runner: runner2, owns: owns2 } = buildRunner(dsUnbounded, null);
    expect(owns2).toBe(false); // unbounded reuses the given DataSource directly, no throwaway instance
    const executed2 = await runner2.runMigrations();
    expect(executed2.map((m) => m.name)).toEqual(['HardenFinancialHistoryForeignKeys1788267000000']);
    await dsUnbounded.destroy();

    const ledger2 = await ds.query(`SELECT name FROM public.typeorm_migrations ORDER BY id`);
    expect(ledger2.map((r: any) => r.name)).toContain('HardenFinancialHistoryForeignKeys1788267000000');
    expect(ledger2).toHaveLength(6);
  }, 120000);
});
