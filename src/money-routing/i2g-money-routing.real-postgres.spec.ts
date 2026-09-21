import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import {
  getB5BTestConnectionConfig,
  resetB5BTestSchema,
  bootstrapB5BTestSchema,
  B5B_ALL_ENTITIES,
} from '../business/b5b-closure-test-db';
import { AddWorkspaceOwnershipToOrderAndSale1788264000000 } from '../database/migrations/1788264000000-AddWorkspaceOwnershipToOrderAndSale';
import { AddWalletXorOwnership1788264600000 } from '../database/migrations/1788264600000-AddWalletXorOwnership';
import { AddMoneyRoutingEntry1788265200000 } from '../database/migrations/1788265200000-AddMoneyRoutingEntry';
import { AddPayoutDestination1788265800000 } from '../database/migrations/1788265800000-AddPayoutDestination';
import { AddFinancialReconciliationJournal1788266400000 } from '../database/migrations/1788266400000-AddFinancialReconciliationJournal';
import { HardenFinancialHistoryForeignKeys1788267000000 } from '../database/migrations/1788267000000-HardenFinancialHistoryForeignKeys';
import { Wallet } from '../wallet/entities/wallet.entity';
import { WalletTransaction } from '../wallet/entities/wallet-transaction.entity';
import { WalletService } from '../wallet/wallet.service';
import { PayoutDestinationService } from '../wallet/payout-destination.service';
import { PayoutPolicyService } from '../wallet/payout-policy.service';
import { WalletController } from '../wallet/wallet.controller';
import { MoneyRoutingService, sellerProceedsEventKey } from './money-routing.service';
import { MoneyRoutingBlockedException } from './order-routing-target';
import { OwnershipFeatureFlagsService } from '../ownership/ownership-feature-flags.service';
import { UsersService } from '../users/users.service';
import { RoleContextException } from '../role-context/role-context.exception';
import { SuperAgentsService } from '../super-agents/super-agents.service';
import { OrdersService } from '../orders/orders.service';
import { SalesService } from '../sales/sales.service';
import { SellerScope, NoTeamMembershipException } from '../business/seller-scope.service';
import { Business, BusinessStatus } from '../business/entities/business.entity';
import { OperationalWorkspace, OperationalWorkspaceStatus } from '../business/entities/operational-workspace.entity';
import { BusinessMembership, BusinessMembershipRoleTemplate, BusinessMembershipStatus } from '../business/entities/business-membership.entity';
import { WorkspaceAssignment, WorkspaceAssignmentStatus } from '../business/entities/workspace-assignment.entity';
import { BusinessCapability, BusinessCapabilityCode, BusinessCapabilityStatus } from '../business/entities/business-capability.entity';
import { User } from '../users/entities/user.entity';
import { MoneyRoutingEntry } from './entities/money-routing-entry.entity';
import { PayoutDestination } from '../wallet/entities/payout-destination.entity';

/**
 * I2G — real disposable Postgres. The schema is built as the PRE-I2G production shape (legacy
 * order/sale/wallet/… tables, legacy FK actions) and then the ACTUAL six I2G migrations are
 * executed, so constraints/FK actions/partial uniques/CHECKs asserted below are the real ones.
 */
describe('I2G — Order/Sale/Wallet workspace partition, real disposable-DB', () => {
  const config = getB5BTestConnectionConfig();
  const reachable = !!config;
  let ds: DataSource;
  let wallets: WalletService;
  let destinations: PayoutDestinationService;
  let routing: MoneyRoutingService;
  let seq = 0;

  const flags = new OwnershipFeatureFlagsService();
  const q = (sql: string, params: any[] = []) => ds.query(sql, params);
  const repo = (e: any) => ds.getRepository(e) as any;

  const makeUser = async (name: string, extra: Partial<User> = {}) => {
    const n = ++seq;
    return repo(User).save(repo(User).create({ email: `u${n}@i2g.local`, phone: `+2558${String(n).padStart(8, '0')}`, password: 'x', name, ...extra }));
  };

  const makeBusiness = async (owner: User, name: string, opts: { selling?: boolean } = {}) => {
    const business = await repo(Business).save(repo(Business).create({ legalName: `${name} Ltd`, tradingName: name, user: owner, status: BusinessStatus.ACTIVE }));
    const workspace = await repo(OperationalWorkspace).save(repo(OperationalWorkspace).create({ businessId: business.id, name: 'Default Operations', isDefault: true, status: OperationalWorkspaceStatus.ACTIVE }));
    const membership = await repo(BusinessMembership).save(repo(BusinessMembership).create({ businessId: business.id, userId: owner.id, roleTemplate: BusinessMembershipRoleTemplate.OWNER, status: BusinessMembershipStatus.ACTIVE }));
    const assignment = await repo(WorkspaceAssignment).save(repo(WorkspaceAssignment).create({ businessMembershipId: membership.id, workspaceId: workspace.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {} }));
    if (opts.selling) {
      await repo(BusinessCapability).save(repo(BusinessCapability).create({ workspaceId: workspace.id, capabilityCode: BusinessCapabilityCode.COMMERCE, status: BusinessCapabilityStatus.ACTIVE, approvedAt: new Date() }));
    }
    return { business, workspace, membership, assignment };
  };

  const makeProduct = async (sellerId: number, workspaceId: number | null) =>
    (await q(`INSERT INTO product ("sellerId","workspaceId") VALUES ($1,$2) RETURNING id`, [sellerId, workspaceId]))[0].id as number;

  const makeOrder = async (sellerId: number | null, workspaceId: number | null, productId: number | null = null, source = 'online') =>
    (await q(`INSERT INTO "order" ("sellerId","workspaceId","productId",source) VALUES ($1,$2,$3,$4) RETURNING id`, [sellerId, workspaceId, productId, source]))[0].id as number;

  const balanceOf = async (walletId: number) => Number((await q(`SELECT balance FROM wallet WHERE id=$1`, [walletId]))[0].balance);
  const ledgerRows = (orderId: number) => q(`SELECT * FROM wallet_transaction WHERE "referenceType"='order' AND "referenceId"=$1`, [orderId]);
  const entryOf = async (orderId: number) => (await q(`SELECT * FROM money_routing_entry WHERE "eventKey"=$1`, [sellerProceedsEventKey(orderId)]))[0];
  const walletCount = async () => Number((await q(`SELECT count(*)::int n FROM wallet`))[0].n);

  const runMigrations = async (direction: 'up' | 'down') => {
    const runner = ds.createQueryRunner();
    await runner.connect();
    const list = [
      new AddWorkspaceOwnershipToOrderAndSale1788264000000(),
      new AddWalletXorOwnership1788264600000(),
      new AddMoneyRoutingEntry1788265200000(),
      new AddPayoutDestination1788265800000(),
      new AddFinancialReconciliationJournal1788266400000(),
      new HardenFinancialHistoryForeignKeys1788267000000(),
    ];
    for (const m of direction === 'up' ? list : [...list].reverse()) await m[direction](runner);
    await runner.release();
  };

  // Pre-I2G production shape (legacy FK actions and UNIQUE(userId) included).
  const createLegacyMoneySchema = async () => {
    await q(`CREATE TABLE product (id serial PRIMARY KEY, "sellerId" int REFERENCES "user"(id) ON DELETE CASCADE, "workspaceId" int REFERENCES operational_workspace(id) ON DELETE SET NULL)`);
    await q(`CREATE TABLE "order" (id serial PRIMARY KEY, "sellerId" int, "productId" int REFERENCES product(id), source varchar, "trackingNumber" varchar)`);
    await q(`ALTER TABLE "order" ADD CONSTRAINT "FK_8a583acc24e13bcf84b1b9d0d20" FOREIGN KEY ("sellerId") REFERENCES "user"(id) ON DELETE SET NULL`);
    await q(`CREATE TABLE sale (id serial PRIMARY KEY, "sellerId" int NOT NULL, "createdAt" timestamp DEFAULT now())`);
    await q(`ALTER TABLE sale ADD CONSTRAINT "FK_8107fa8e7838a1882adab4564be" FOREIGN KEY ("sellerId") REFERENCES "user"(id) ON DELETE CASCADE`);
    await q(`CREATE TABLE wallet (id serial PRIMARY KEY, "userId" int NOT NULL, balance numeric(12,2) NOT NULL DEFAULT 0, "pendingBalance" numeric(12,2) NOT NULL DEFAULT 0, "totalEarned" numeric(12,2) NOT NULL DEFAULT 0, "totalWithdrawn" numeric(12,2) NOT NULL DEFAULT 0, currency varchar NOT NULL DEFAULT 'TZS', "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now())`);
    await q(`ALTER TABLE wallet ADD CONSTRAINT "REL_35472b1fe48b6330cd34970956" UNIQUE ("userId")`);
    await q(`ALTER TABLE wallet ADD CONSTRAINT "FK_35472b1fe48b6330cd349709564" FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE`);
    await q(`CREATE TABLE wallet_transaction (id serial PRIMARY KEY, "walletId" int NOT NULL REFERENCES wallet(id) ON DELETE CASCADE, type varchar NOT NULL, amount numeric(12,2) NOT NULL, "balanceAfter" numeric(12,2) NOT NULL, "referenceType" varchar, "referenceId" int, status varchar NOT NULL DEFAULT 'completed', note text, "createdAt" timestamp NOT NULL DEFAULT now())`);
    await q(`CREATE TABLE payout (id serial PRIMARY KEY, "sellerId" int NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, "orderId" int REFERENCES "order"(id) ON DELETE CASCADE)`);
    await q(`CREATE TABLE invoice (id serial PRIMARY KEY, "orderId" int REFERENCES "order"(id) ON DELETE CASCADE, "buyerId" int REFERENCES "user"(id) ON DELETE CASCADE)`);
    await q(`CREATE TABLE classified_invoice_request (id serial PRIMARY KEY, "classifiedId" int REFERENCES classified(id) ON DELETE CASCADE, "orderRefId" int REFERENCES "order"(id) ON DELETE SET NULL, "sellerId" int REFERENCES "user"(id) ON DELETE CASCADE, "buyerId" int REFERENCES "user"(id) ON DELETE CASCADE)`);
  };

  beforeAll(async () => {
    if (!config) return;
    const client = new Client(config);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();
    await bootstrapB5BTestSchema(config);
    ds = new DataSource({
      type: 'postgres', host: config.host, port: config.port, username: config.user,
      password: config.password, database: config.database, synchronize: false,
      entities: [...B5B_ALL_ENTITIES, Wallet, WalletTransaction, MoneyRoutingEntry, PayoutDestination],
    });
    await ds.initialize();
    await createLegacyMoneySchema();
    await runMigrations('up');

    const policy = new PayoutPolicyService();
    destinations = new PayoutDestinationService(ds, policy, flags);
    wallets = new WalletService(
      repo(Wallet), repo(WalletTransaction), repo(User), ds,
      { getLevel: jest.fn().mockResolvedValue(1) } as any, destinations, flags,
    );
    routing = new MoneyRoutingService(ds, wallets, flags);
  }, 120000);

  afterAll(async () => { if (ds?.isInitialized) await ds.destroy(); });
  afterEach(() => {
    delete process.env.OWNERSHIP_FLAG_BUSINESS_PAYOUT_DESTINATION_ENABLED;
    delete process.env.OWNERSHIP_FLAG_BUSINESS_WITHDRAWAL_ENABLED;
    delete process.env.PAYOUT_DESTINATION_COOLING_OFF_SECONDS;
    delete process.env.OWNERSHIP_FLAG_RELEASE_GUARD_ENFORCE;
    jest.restoreAllMocks();
  });

  it('§0 disposable database reachable', () => expect(reachable).toBe(true));

  // ── schema ────────────────────────────────────────────────────────────────
  describe('migrations (the real files, real Postgres)', () => {
    it('introduce the approved columns, RESTRICT FKs, indexes and CHECKs', async () => {
      if (!reachable) return;
      const cols = await q(`SELECT table_name, column_name, is_nullable FROM information_schema.columns WHERE column_name='workspaceId' AND table_name IN ('order','sale','wallet') ORDER BY 1`);
      expect(cols.map((c: any) => [c.table_name, c.is_nullable])).toEqual([['order', 'YES'], ['sale', 'YES'], ['wallet', 'YES']]);
      const walletUser = await q(`SELECT is_nullable FROM information_schema.columns WHERE table_name='wallet' AND column_name='userId'`);
      expect(walletUser[0].is_nullable).toBe('YES');
      const fks = await q(`SELECT conrelid::regclass::text t, conname, confdeltype FROM pg_constraint WHERE contype='f' AND conname IN ('FK_order_workspace','FK_sale_workspace','FK_wallet_workspace','FK_wallet_user','FK_money_routing_order','FK_payout_destination_workspace')`);
      expect(fks).toHaveLength(6);
      expect(fks.every((f: any) => f.confdeltype === 'r')).toBe(true);
      const idx = (await q(`SELECT indexname FROM pg_indexes WHERE indexname IN ('UQ_wallet_personal','UQ_wallet_workspace','UQ_payout_destination_active','IDX_order_workspace','IDX_order_seller_workspace','IDX_sale_workspace','IDX_sale_seller_workspace_created')`)).map((r: any) => r.indexname).sort();
      expect(idx).toHaveLength(7);
      const checks = (await q(`SELECT conname FROM pg_constraint WHERE contype='c' AND conname IN ('CK_wallet_exactly_one_owner','CK_wallet_nonnegative','CK_money_routing_target','CK_money_routing_routed')`)).length;
      expect(checks).toBe(4);
      // the old UNIQUE(userId) is gone
      expect(await q(`SELECT 1 FROM pg_constraint WHERE conname='REL_35472b1fe48b6330cd34970956'`)).toHaveLength(0);
    });

    it('gate H turned the finance-history FKs into RESTRICT', async () => {
      if (!reachable) return;
      const rows = await q(`SELECT conrelid::regclass::text t, a.attname col, c.confdeltype act FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
        WHERE c.contype='f' AND (conrelid::regclass::text, a.attname) IN (('sale','sellerId'),('payout','sellerId'),('payout','orderId'),('invoice','orderId'),('invoice','buyerId'),('wallet_transaction','walletId'),('classified_invoice_request','sellerId'),('classified_invoice_request','buyerId'),('classified_invoice_request','classifiedId'),('"order"','sellerId'))`);
      expect(rows).toHaveLength(10);
      expect(rows.every((r: any) => r.act === 'r')).toBe(true);
    });

    it('a user with sale/payout/wallet history cannot be hard-deleted at the database level; a user without can', async () => {
      if (!reachable) return;
      const seller = await makeUser('HasHistory');
      await q(`INSERT INTO sale ("sellerId") VALUES ($1)`, [seller.id]);
      await expect(q(`DELETE FROM "user" WHERE id=$1`, [seller.id])).rejects.toThrow(/foreign key|violates/i);
      const clean = await makeUser('Clean');
      await expect(q(`DELETE FROM "user" WHERE id=$1`, [clean.id])).resolves.toBeDefined();
    });

    it('down migrations are reversible while no I2G data exists (run in a rolled-back transaction) and refuse once Business wallets / entries exist', async () => {
      if (!reachable) return;
      const runner = ds.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        // (a) with I2G data present the data-bearing downs refuse
        const owner = await makeUser('DownRefuse');
        const biz = await makeBusiness(owner, 'Down-A');
        await runner.query('INSERT INTO wallet ("workspaceId") VALUES ($1)', [biz.workspace.id]);
        await expect(new AddWalletXorOwnership1788264600000().down(runner)).rejects.toThrow(/refused/);
      } finally {
        await runner.rollbackTransaction();
      }
      await runner.startTransaction();
      try {
        // (b) with no I2G rows the whole set reverses to the legacy shape
        await runner.query('DELETE FROM money_routing_entry');
        await runner.query('DELETE FROM wallet_transaction');
        await runner.query('DELETE FROM wallet WHERE "workspaceId" IS NOT NULL');
        await runner.query('DELETE FROM payout_destination');
        const reverse = [
          new HardenFinancialHistoryForeignKeys1788267000000(), new AddFinancialReconciliationJournal1788266400000(),
          new AddPayoutDestination1788265800000(), new AddMoneyRoutingEntry1788265200000(),
          new AddWalletXorOwnership1788264600000(), new AddWorkspaceOwnershipToOrderAndSale1788264000000(),
        ];
        for (const m of reverse) await m.down(runner);
        const legacy = await runner.query("SELECT conname FROM pg_constraint WHERE conname = 'REL_35472b1fe48b6330cd34970956'");
        expect(legacy).toHaveLength(1);
        const gone = await runner.query("SELECT 1 FROM information_schema.columns WHERE column_name = 'workspaceId' AND table_name IN ('order','sale','wallet')");
        expect(gone).toHaveLength(0);
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
      }
    });
  });

  // ── wallet ownership ──────────────────────────────────────────────────────
  describe('wallet XOR ownership + explicit resolvers', () => {
    it('exactly-one-owner CHECK, partial uniques, RESTRICT owners, non-negative balance', async () => {
      if (!reachable) return;
      const owner = await makeUser('WOwner');
      const { workspace } = await makeBusiness(owner, 'WBiz');
      await expect(q(`INSERT INTO wallet ("userId","workspaceId") VALUES ($1,$2)`, [owner.id, workspace.id])).rejects.toThrow(/CK_wallet_exactly_one_owner/);
      await expect(q(`INSERT INTO wallet ("userId","workspaceId") VALUES (NULL,NULL)`)).rejects.toThrow(/CK_wallet_exactly_one_owner/);
      await q(`INSERT INTO wallet ("userId") VALUES ($1)`, [owner.id]);
      await expect(q(`INSERT INTO wallet ("userId") VALUES ($1)`, [owner.id])).rejects.toThrow(/UQ_wallet_personal/);
      await q(`INSERT INTO wallet ("workspaceId") VALUES ($1)`, [workspace.id]); // Personal + Business wallet coexist for the same owner
      await expect(q(`INSERT INTO wallet ("workspaceId") VALUES ($1)`, [workspace.id])).rejects.toThrow(/UQ_wallet_workspace/);
      await expect(q(`UPDATE wallet SET balance = -1 WHERE "workspaceId" = $1`, [workspace.id])).rejects.toThrow(/CK_wallet_nonnegative/);
      // durable ownership: cannot delete the owner or the workspace while a wallet exists
      await expect(q(`DELETE FROM operational_workspace WHERE id=$1`, [workspace.id])).rejects.toThrow(/violates foreign key/i);
      await expect(q(`DELETE FROM "user" WHERE id=$1`, [owner.id])).rejects.toThrow(/violates foreign key/i);
    });

    it('getOrCreate* are idempotent under concurrency (one row each) and distinct per workspace', async () => {
      if (!reachable) return;
      const owner = await makeUser('COwner');
      const A = await makeBusiness(owner, 'CA');
      const B = await makeBusiness(owner, 'CB');
      const personals = await Promise.all(Array.from({ length: 8 }, () => wallets.getOrCreatePersonalWallet(owner.id)));
      const bizA = await Promise.all(Array.from({ length: 8 }, () => wallets.getOrCreateBusinessWallet(A.workspace.id)));
      const bizB = await wallets.getOrCreateBusinessWallet(B.workspace.id);
      expect(new Set(personals.map((w) => w.id)).size).toBe(1);
      expect(new Set(bizA.map((w) => w.id)).size).toBe(1);
      const ids = new Set([personals[0].id, bizA[0].id, bizB.id]);
      expect(ids.size).toBe(3); // Personal, Business A, Business B are three distinct wallets for ONE owner
      expect(personals[0]).toMatchObject({ userId: owner.id, workspaceId: null });
      expect(bizA[0]).toMatchObject({ userId: null, workspaceId: A.workspace.id });
      await expect(wallets.getOrCreateBusinessWallet(987654)).rejects.toMatchObject({ response: { code: 'WORKSPACE_NOT_FOUND' } });
    });

    it('walletForContext: BUSINESS -> workspace wallet, everything else -> Personal; an unresolved BUSINESS context never falls back to Personal', async () => {
      if (!reachable) return;
      const owner = await makeUser('XOwner');
      const A = await makeBusiness(owner, 'XA');
      const biz = await wallets.walletForContext({ identityType: 'BUSINESS', workspaceId: A.workspace.id, userId: owner.id } as any);
      const personal = await wallets.walletForContext({ identityType: 'PERSONAL', workspaceId: null, userId: owner.id } as any);
      expect(biz.workspaceId).toBe(A.workspace.id);
      expect(personal.userId).toBe(owner.id);
      expect(biz.id).not.toBe(personal.id);
      await expect(wallets.walletForContext({ identityType: 'BUSINESS', workspaceId: null, userId: owner.id } as any)).rejects.toMatchObject({ response: { code: 'WALLET_CONTEXT_UNRESOLVED' } });
    });

    it('credit/debit are atomic and guarded (no negative balance, no partial ledger)', async () => {
      if (!reachable) return;
      const owner = await makeUser('AOwner', { payoutMethod: 'mpesa', payoutAccountName: 'A O', payoutAccountNumber: '0700000000' } as any);
      const w = await wallets.getOrCreatePersonalWallet(owner.id);
      await ds.transaction((m) => wallets.creditWallet(m, w.id, 100, { type: 'credit_escrow_release' as any, referenceType: 'order', referenceId: 1 }));
      await expect(wallets.requestPersonalWithdrawal(owner.id, 500)).rejects.toThrow(/Insufficient/);
      expect(await balanceOf(w.id)).toBe(100);
      const before = Number((await q(`SELECT count(*)::int n FROM wallet_transaction WHERE "walletId"=$1`, [w.id]))[0].n);
      expect(before).toBe(1); // the refused withdrawal left no ledger row
      // concurrent withdrawals cannot overdraw
      const results = await Promise.allSettled([wallets.requestPersonalWithdrawal(owner.id, 60), wallets.requestPersonalWithdrawal(owner.id, 60)]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await balanceOf(w.id)).toBe(40);
    });
  });

  // ── money routing ─────────────────────────────────────────────────────────
  describe('fail-closed money routing (seller proceeds)', () => {
    it('A/B same-owner isolation: each Business order credits ITS workspace wallet; the Personal wallet is untouched', async () => {
      if (!reachable) return;
      const owner = await makeUser('RA');
      const A = await makeBusiness(owner, 'RA-A', { selling: true });
      const B = await makeBusiness(owner, 'RA-B', { selling: true });
      const personal = await wallets.getOrCreatePersonalWallet(owner.id);
      const oA = await makeOrder(owner.id, A.workspace.id);
      const oB = await makeOrder(owner.id, B.workspace.id);
      const rA = await routing.creditSellerProceeds({ orderId: oA, amount: 1000, source: 'ESCROW_RELEASE' });
      const rB = await routing.creditSellerProceeds({ orderId: oB, amount: 2500, source: 'ESCROW_RELEASE' });
      expect(rA.state).toBe('ROUTED');
      expect(rB.state).toBe('ROUTED');
      const wA = await wallets.getOrCreateBusinessWallet(A.workspace.id);
      const wB = await wallets.getOrCreateBusinessWallet(B.workspace.id);
      expect(await balanceOf(wA.id)).toBe(1000);
      expect(await balanceOf(wB.id)).toBe(2500);
      expect(await balanceOf(personal.id)).toBe(0);
    });

    it('legacy Personal Seller (NULL workspace, no Selling Business) is routed explicitly to the Personal wallet', async () => {
      if (!reachable) return;
      const seller = await makeUser('Legacy');
      const o = await makeOrder(seller.id, null);
      const r = await routing.creditSellerProceeds({ orderId: o, amount: 700, source: 'ESCROW_RELEASE' });
      expect(r.state).toBe('ROUTED');
      const entry = await entryOf(o);
      expect(entry).toMatchObject({ targetType: 'PERSONAL_USER', targetUserId: seller.id, targetWorkspaceId: null });
      expect(await balanceOf((await wallets.getOrCreatePersonalWallet(seller.id)).id)).toBe(700);
    });

    it('R2: order unstamped but its Product is stamped -> BLOCKED with a stable reason; NEVER the owner\'s Personal wallet', async () => {
      if (!reachable) return;
      const owner = await makeUser('R2');
      const A = await makeBusiness(owner, 'R2-A', { selling: true });
      const product = await makeProduct(owner.id, A.workspace.id);
      const o = await makeOrder(owner.id, null, product);
      const before = await walletCount();
      const r = await routing.creditSellerProceeds({ orderId: o, amount: 900, source: 'ESCROW_RELEASE' });
      expect(r).toMatchObject({ state: 'BLOCKED', blockReason: 'PARENT_STAMPED_ORDER_UNSTAMPED' });
      expect(r.blockDetail).toMatchObject({ orderId: o, sellerId: owner.id, productId: product, productWorkspaceId: A.workspace.id });
      expect(await walletCount()).toBe(before); // no Personal (or any) wallet was created or credited
      expect(await ledgerRows(o)).toHaveLength(0);
      const entry = await entryOf(o);
      expect(entry).toMatchObject({ state: 'BLOCKED', blockReason: 'PARENT_STAMPED_ORDER_UNSTAMPED', targetType: 'UNRESOLVED' });
      // the release guard refuses BEFORE any status change, with the same stable code + identifiers
      await expect(routing.assertRoutable(o, 900, 'ESCROW_RELEASE')).rejects.toBeInstanceOf(MoneyRoutingBlockedException);
      await expect(routing.assertRoutable(o, 900, 'ESCROW_RELEASE')).rejects.toMatchObject({ response: { code: 'MONEY_ROUTING_BLOCKED', reason: 'PARENT_STAMPED_ORDER_UNSTAMPED' } });
    });

    it('R3: unstamped order of an owner with an active Selling Business is ambiguous -> BLOCKED (no guess, no Personal fallback)', async () => {
      if (!reachable) return;
      const owner = await makeUser('R3');
      const A = await makeBusiness(owner, 'R3-A', { selling: true });
      const o = await makeOrder(owner.id, null, null, 'seller_shipment');
      const before = await walletCount();
      const r = await routing.creditSellerProceeds({ orderId: o, amount: 300, source: 'COD_DELIVERY' });
      expect(r).toMatchObject({ state: 'BLOCKED', blockReason: 'AMBIGUOUS_LEGACY_OWNER' });
      expect(r.blockDetail).toMatchObject({ orderId: o, sellerId: owner.id, sellingBusinesses: [{ businessId: A.business.id, workspaceId: A.workspace.id }] });
      expect(await walletCount()).toBe(before);
    });

    it('R4: hub/logistics-side order (no seller) has no seller credit and creates no entry', async () => {
      if (!reachable) return;
      const o = await makeOrder(null, null, null, 'offline_intercity');
      const r = await routing.creditSellerProceeds({ orderId: o, amount: 500, source: 'ESCROW_RELEASE' });
      expect(r.state).toBe('NOT_APPLICABLE');
      expect(await entryOf(o)).toBeUndefined();
    });

    it('idempotent seller-proceeds credit: webhook + escrow + COD + invoice-paid (concurrent, repeated) converge on ONE event and ONE ledger row', async () => {
      if (!reachable) return;
      const owner = await makeUser('IDEM');
      const A = await makeBusiness(owner, 'IDEM-A', { selling: true });
      const o = await makeOrder(owner.id, A.workspace.id);
      const sources = ['WEBHOOK_SETTLEMENT', 'ESCROW_RELEASE', 'COD_DELIVERY', 'INVOICE_PAID', 'ESCROW_RELEASE', 'WEBHOOK_SETTLEMENT'] as const;
      await Promise.all(sources.map((source) => routing.creditSellerProceeds({ orderId: o, amount: 1234.5, source, ref: source })));
      await routing.creditSellerProceeds({ orderId: o, amount: 1234.5, source: 'ESCROW_RELEASE' }); // a late retry
      const wA = await wallets.getOrCreateBusinessWallet(A.workspace.id);
      expect(await balanceOf(wA.id)).toBe(1234.5); // credited exactly once
      expect(await ledgerRows(o)).toHaveLength(1);
      const entry = await entryOf(o);
      expect(entry.eventKey).toBe(`ORDER:${o}:SELLER_PROCEEDS`);
      expect(entry.state).toBe('ROUTED');
      const seen = new Set((entry.observations as any[]).map((x) => x.source));
      expect(seen).toEqual(new Set(['WEBHOOK_SETTLEMENT', 'ESCROW_RELEASE', 'COD_DELIVERY', 'INVOICE_PAID']));
      const tx = (await ledgerRows(o))[0];
      expect(tx.routingEntryId).toBe(entry.id);
      // the ledger's reference to the entry is UNIQUE: a second row for the same entry is impossible
      await expect(q(`INSERT INTO wallet_transaction ("walletId",type,amount,"balanceAfter","routingEntryId") VALUES ($1,'credit_escrow_release',1,1,$2)`, [wA.id, entry.id])).rejects.toThrow(/UQ_wallet_transaction_routing_entry/);
    });

    it('event identity is NOT the order id: a future refund/adjustment for the same order has its own key, while a duplicate seller-proceeds key is impossible', async () => {
      if (!reachable) return;
      const owner = await makeUser('KEY');
      const o = await makeOrder(owner.id, null);
      await routing.creditSellerProceeds({ orderId: o, amount: 100, source: 'ESCROW_RELEASE' });
      await q(`INSERT INTO money_routing_entry ("eventKey","eventType","orderId",amount,"targetType","targetUserId",state) VALUES ($1,'REFUND',$2,10,'PERSONAL_USER',$3,'PENDING')`, [`ORDER:${o}:REFUND:1`, o, owner.id]);
      await q(`INSERT INTO money_routing_entry ("eventKey","eventType","orderId",amount,"targetType","targetUserId",state) VALUES ($1,'PARTIAL_REFUND',$2,5,'PERSONAL_USER',$3,'PENDING')`, [`ORDER:${o}:PARTIAL_REFUND:1`, o, owner.id]);
      expect(Number((await q(`SELECT count(*)::int n FROM money_routing_entry WHERE "orderId"=$1`, [o]))[0].n)).toBe(3);
      await expect(q(`INSERT INTO money_routing_entry ("eventKey","eventType","orderId",amount,"targetType","targetUserId",state) VALUES ($1,'SELLER_PROCEEDS',$2,1,'PERSONAL_USER',$3,'PENDING')`, [sellerProceedsEventKey(o), o, owner.id])).rejects.toThrow(/UQ_money_routing_event_key/);
    });

    it('a different amount for the same event never credits: PENDING -> BLOCKED(AMOUNT_CONFLICT); after ROUTED it is a no-op', async () => {
      if (!reachable) return;
      const owner = await makeUser('AMT');
      const A = await makeBusiness(owner, 'AMT-A', { selling: true });
      const o = await makeOrder(owner.id, A.workspace.id);
      await q(`INSERT INTO money_routing_entry ("eventKey","eventType","orderId",amount,"targetType","targetWorkspaceId",state) VALUES ($1,'SELLER_PROCEEDS',$2,100,'BUSINESS_WORKSPACE',$3,'PENDING')`, [sellerProceedsEventKey(o), o, A.workspace.id]);
      const r = await routing.creditSellerProceeds({ orderId: o, amount: 80, source: 'COD_DELIVERY' });
      expect(r).toMatchObject({ state: 'BLOCKED', blockReason: 'AMOUNT_CONFLICT' });
      expect(await ledgerRows(o)).toHaveLength(0);
      // routed orders ignore a later, different observation
      const o2 = await makeOrder(owner.id, A.workspace.id);
      await routing.creditSellerProceeds({ orderId: o2, amount: 50, source: 'ESCROW_RELEASE' });
      const again = await routing.creditSellerProceeds({ orderId: o2, amount: 45, source: 'COD_DELIVERY' });
      expect(again.state).toBe('ROUTED');
      expect(await ledgerRows(o2)).toHaveLength(1);
    });

    it('retry: a transient failure keeps the entry PENDING with backoff; the worker credits it exactly once', async () => {
      if (!reachable) return;
      const owner = await makeUser('RETRY');
      const A = await makeBusiness(owner, 'RETRY-A', { selling: true });
      const o = await makeOrder(owner.id, A.workspace.id);
      const spy = jest.spyOn(wallets, 'creditWallet').mockRejectedValueOnce(new Error('deadlock detected'));
      const first = await routing.creditSellerProceeds({ orderId: o, amount: 400, source: 'WEBHOOK_SETTLEMENT' });
      expect(first.state).toBe('PENDING');
      const e1 = await entryOf(o);
      expect(e1.attempts).toBe(1);
      expect(e1.lastError).toMatch(/deadlock/);
      expect(await ledgerRows(o)).toHaveLength(0); // rolled back atomically
      spy.mockRestore();
      await q(`UPDATE money_routing_entry SET "nextAttemptAt" = now() - interval '1 second' WHERE id = $1`, [e1.id]);
      expect(await routing.retryDue()).toBeGreaterThanOrEqual(1);
      expect((await entryOf(o)).state).toBe('ROUTED');
      await routing.retryDue(); // worker re-run is a no-op
      expect(await ledgerRows(o)).toHaveLength(1);
    });

    it('a crash after the wallet UPDATE rolls back the whole credit (no half-applied money)', async () => {
      if (!reachable) return;
      const owner = await makeUser('CRASH');
      const A = await makeBusiness(owner, 'CRASH-A', { selling: true });
      const o = await makeOrder(owner.id, A.workspace.id);
      const real = wallets.creditWallet.bind(wallets);
      jest.spyOn(wallets, 'creditWallet').mockImplementationOnce(async (m, id, amt, ledger) => {
        await real(m, id, amt, ledger);
        throw new Error('crash after ledger');
      });
      const r = await routing.creditSellerProceeds({ orderId: o, amount: 250, source: 'ESCROW_RELEASE' });
      expect(r.state).toBe('PENDING');
      const wA = await wallets.getOrCreateBusinessWallet(A.workspace.id);
      expect(await balanceOf(wA.id)).toBe(0);
      expect(await ledgerRows(o)).toHaveLength(0);
    });

    it('retries are bounded: repeated failure ends BLOCKED(RETRY_EXHAUSTED), never auto-retried afterwards', async () => {
      if (!reachable) return;
      const owner = await makeUser('EXH');
      const A = await makeBusiness(owner, 'EXH-A', { selling: true });
      const o = await makeOrder(owner.id, A.workspace.id);
      jest.spyOn(wallets, 'creditWallet').mockRejectedValue(new Error('db down'));
      await routing.creditSellerProceeds({ orderId: o, amount: 10, source: 'ESCROW_RELEASE' });
      await q(`UPDATE money_routing_entry SET attempts = 7 WHERE "eventKey" = $1`, [sellerProceedsEventKey(o)]);
      const r = await routing.routeEntry((await entryOf(o)).id);
      expect(r).toMatchObject({ state: 'BLOCKED', blockReason: 'RETRY_EXHAUSTED' });
      jest.restoreAllMocks();
      await q(`UPDATE money_routing_entry SET "nextAttemptAt" = now() - interval '1 hour' WHERE "eventKey" = $1`, [sellerProceedsEventKey(o)]);
      await routing.retryDue();
      expect((await entryOf(o)).state).toBe('BLOCKED');
    });

    it('a BLOCKED entry can be resolved only by re-deriving the target; a changed ownership is refused, never followed silently', async () => {
      if (!reachable) return;
      const owner = await makeUser('RES');
      const A = await makeBusiness(owner, 'RES-A', { selling: true });
      const product = await makeProduct(owner.id, A.workspace.id);
      const o = await makeOrder(owner.id, null, product);
      const operator = await makeUser('Operator');
      const blocked = await routing.creditSellerProceeds({ orderId: o, amount: 640, source: 'ESCROW_RELEASE' });
      expect(blocked.state).toBe('BLOCKED');
      // still unresolved data => resolve re-blocks (operator cannot type a destination)
      await routing.resolveBlocked(blocked.entryId!, operator.id, 'checked');
      expect((await routing.routeEntry(blocked.entryId!)).state).toBe('BLOCKED');
      // an approved reconciliation (simulated here as the data fix) stamps the order; only then it routes to the Business wallet
      await q(`UPDATE "order" SET "workspaceId" = $2 WHERE id = $1`, [o, A.workspace.id]);
      await routing.resolveBlocked(blocked.entryId!, operator.id, 'ownership evidenced');
      const routed = await routing.routeEntry(blocked.entryId!);
      expect(routed.state).toBe('ROUTED');
      const wA = await wallets.getOrCreateBusinessWallet(A.workspace.id);
      expect(await balanceOf(wA.id)).toBe(640);
      expect((await entryOf(o)).resolvedByUserId).toBe(operator.id);
    });

    it('a PENDING entry whose recorded Personal target no longer matches the order (now stamped) is BLOCKED, not credited to the stale target', async () => {
      if (!reachable) return;
      const owner = await makeUser('STALE');
      const A = await makeBusiness(owner, 'STALE-A');
      const o = await makeOrder(owner.id, A.workspace.id);
      await q(`INSERT INTO money_routing_entry ("eventKey","eventType","orderId",amount,"targetType","targetUserId",state) VALUES ($1,'SELLER_PROCEEDS',$2,55,'PERSONAL_USER',$3,'PENDING')`, [sellerProceedsEventKey(o), o, owner.id]);
      const r = await routing.routeEntry((await entryOf(o)).id);
      expect(r).toMatchObject({ state: 'BLOCKED', blockReason: 'WALLET_UNRESOLVABLE' });
      expect(await ledgerRows(o)).toHaveLength(0);
    });

    it('the release guard can be switched off only explicitly (default ON)', async () => {
      if (!reachable) return;
      expect(flags.isEnabled('RELEASE_GUARD_ENFORCE')).toBe(true);
      const owner = await makeUser('GUARD');
      const A = await makeBusiness(owner, 'GUARD-A', { selling: true });
      const product = await makeProduct(owner.id, A.workspace.id);
      const o = await makeOrder(owner.id, null, product);
      process.env.OWNERSHIP_FLAG_RELEASE_GUARD_ENFORCE = 'false';
      await expect(routing.assertRoutable(o, 10, 'ESCROW_RELEASE')).resolves.toBeUndefined();
      delete process.env.OWNERSHIP_FLAG_RELEASE_GUARD_ENFORCE;
      await expect(routing.assertRoutable(o, 10, 'ESCROW_RELEASE')).rejects.toBeInstanceOf(MoneyRoutingBlockedException);
    });
  });

  // ── payout destination ────────────────────────────────────────────────────
  describe('Business payout destination', () => {
    const ctxFor = (userId: number, workspaceId: number | null, identityType: any = 'BUSINESS') => ({ identityType, workspaceId, userId }) as any;
    const dto = { method: 'bank', accountName: 'Acme Ltd', accountNumber: '0123456789', bankName: 'CRDB' };

    it('is disabled by default and needs the exact BUSINESS context + Business owner (re-checked in the database)', async () => {
      if (!reachable) return;
      const owner = await makeUser('PDO');
      const A = await makeBusiness(owner, 'PD-A');
      await expect(destinations.create(ctxFor(owner.id, A.workspace.id), dto)).rejects.toMatchObject({ response: { code: 'BUSINESS_PAYOUT_DESTINATION_DISABLED' } });
      process.env.OWNERSHIP_FLAG_BUSINESS_PAYOUT_DESTINATION_ENABLED = 'true';
      await expect(destinations.create(ctxFor(owner.id, null, 'PERSONAL'), dto)).rejects.toMatchObject({ response: { code: 'PAYOUT_DESTINATION_BUSINESS_CONTEXT_REQUIRED' } });
      const stranger = await makeUser('PDStranger');
      await expect(destinations.create(ctxFor(stranger.id, A.workspace.id), dto)).rejects.toMatchObject({ response: { code: 'PAYOUT_DESTINATION_OWNER_REQUIRED' } });
      // a non-owner member (staff) of the Business is refused too: no delegation yet
      const staff = await makeUser('PDStaff');
      const m = await repo(BusinessMembership).save(repo(BusinessMembership).create({ businessId: A.business.id, userId: staff.id, roleTemplate: 'manager' as any, status: BusinessMembershipStatus.ACTIVE }));
      await repo(WorkspaceAssignment).save(repo(WorkspaceAssignment).create({ businessMembershipId: m.id, workspaceId: A.workspace.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {} }));
      await expect(destinations.create(ctxFor(staff.id, A.workspace.id), dto)).rejects.toMatchObject({ response: { code: 'PAYOUT_DESTINATION_OWNER_REQUIRED' } });
      const created = await destinations.create(ctxFor(owner.id, A.workspace.id), dto);
      expect(created).toMatchObject({ workspaceId: A.workspace.id, status: 'pending_verification', createdByUserId: owner.id });
    });

    it('same-owner Business A cannot use, list or disable Business B\'s destination; the workspace comes from the context, never a payload', async () => {
      if (!reachable) return;
      process.env.OWNERSHIP_FLAG_BUSINESS_PAYOUT_DESTINATION_ENABLED = 'true';
      const owner = await makeUser('ISO');
      const A = await makeBusiness(owner, 'ISO-A');
      const B = await makeBusiness(owner, 'ISO-B');
      const dB = await destinations.create(ctxFor(owner.id, B.workspace.id), dto);
      await expect(destinations.disable(ctxFor(owner.id, A.workspace.id), dB.id)).rejects.toMatchObject({ response: { code: 'PAYOUT_DESTINATION_NOT_FOUND' } });
      expect(await destinations.listForContext(ctxFor(owner.id, A.workspace.id))).toHaveLength(0);
      const listB = await destinations.listForContext(ctxFor(owner.id, B.workspace.id));
      expect(listB).toHaveLength(1);
      expect(listB[0].accountNumber).toMatch(/^\*+6789$/); // masked
    });

    it('activation fails closed when the cooling-off policy is unset; explicit config activates; history is append-only with one active row', async () => {
      if (!reachable) return;
      process.env.OWNERSHIP_FLAG_BUSINESS_PAYOUT_DESTINATION_ENABLED = 'true';
      const owner = await makeUser('LIFE');
      const admin = await makeUser('LifeAdmin');
      const A = await makeBusiness(owner, 'LIFE-A');
      const d1 = await destinations.create(ctxFor(owner.id, A.workspace.id), dto);
      await expect(destinations.verify(admin.id, d1.id, {})).rejects.toMatchObject({ response: { code: 'PAYOUT_POLICY_UNAVAILABLE' } });
      for (const bad of ['', '   ', 'abc', '-5', '1.5']) {
        process.env.PAYOUT_DESTINATION_COOLING_OFF_SECONDS = bad;
        await expect(destinations.verify(admin.id, d1.id, {})).rejects.toMatchObject({ response: { code: 'PAYOUT_POLICY_UNAVAILABLE' } });
      }
      process.env.PAYOUT_DESTINATION_COOLING_OFF_SECONDS = '0';
      const v1 = await destinations.verify(admin.id, d1.id, { verificationMethod: 'manual', verificationRef: 'KYC-1' });
      expect(v1).toMatchObject({ status: 'active', coolingOffSeconds: 0, verifiedByUserId: admin.id });
      const d2 = await destinations.create(ctxFor(owner.id, A.workspace.id), { ...dto, accountNumber: '9999999999' });
      const v2 = await destinations.verify(admin.id, d2.id, {});
      expect(v2.status).toBe('active');
      const rows = await q(`SELECT id, status FROM payout_destination WHERE "workspaceId"=$1 ORDER BY id`, [A.workspace.id]);
      expect(rows.map((r: any) => r.status)).toEqual(['superseded', 'active']); // append-only, never overwritten
      await expect(q(`UPDATE payout_destination SET status='active' WHERE id=$1`, [d1.id])).rejects.toThrow(/UQ_payout_destination_active/);
    });

    it('cooling-off is configuration: a configured duration blocks use until usableFrom; the applied value is recorded on the row', async () => {
      if (!reachable) return;
      process.env.OWNERSHIP_FLAG_BUSINESS_PAYOUT_DESTINATION_ENABLED = 'true';
      const owner = await makeUser('COOL');
      const admin = await makeUser('CoolAdmin');
      const A = await makeBusiness(owner, 'COOL-A');
      process.env.PAYOUT_DESTINATION_COOLING_OFF_SECONDS = '7200';
      const d = await destinations.create(ctxFor(owner.id, A.workspace.id), dto);
      const v = await destinations.verify(admin.id, d.id, {});
      expect(v.coolingOffSeconds).toBe(7200);
      expect(new Date(v.usableFrom!).getTime()).toBeGreaterThan(Date.now() + 7000 * 1000);
      await expect(destinations.getUsableDestination(A.workspace.id)).rejects.toMatchObject({ response: { code: 'PAYOUT_DESTINATION_COOLING_OFF' } });
      await q(`UPDATE payout_destination SET "usableFrom" = now() - interval '1 second' WHERE id=$1`, [d.id]);
      await expect(destinations.getUsableDestination(A.workspace.id)).resolves.toMatchObject({ id: d.id });
    });

    it('Business withdrawal: gated by flag, owner, destination and balance; snapshot is immutable; never touches User.payout*', async () => {
      if (!reachable) return;
      process.env.OWNERSHIP_FLAG_BUSINESS_PAYOUT_DESTINATION_ENABLED = 'true';
      const owner = await makeUser('WD', { payoutMethod: 'mpesa', payoutAccountName: 'Personal Name', payoutAccountNumber: '0711111111' } as any);
      const admin = await makeUser('WDAdmin');
      const A = await makeBusiness(owner, 'WD-A', { selling: true });
      const ctx = ctxFor(owner.id, A.workspace.id);
      const wA = await wallets.getOrCreateBusinessWallet(A.workspace.id);
      const o = await makeOrder(owner.id, A.workspace.id);
      await routing.creditSellerProceeds({ orderId: o, amount: 1000, source: 'ESCROW_RELEASE' });

      await expect(wallets.requestBusinessWithdrawal(ctx, 100)).rejects.toMatchObject({ response: { code: 'BUSINESS_WITHDRAWAL_DISABLED' } });
      process.env.OWNERSHIP_FLAG_BUSINESS_WITHDRAWAL_ENABLED = 'true';
      await expect(wallets.requestBusinessWithdrawal(ctxFor(owner.id, null, 'PERSONAL'), 100)).rejects.toMatchObject({ response: { code: 'PAYOUT_DESTINATION_BUSINESS_CONTEXT_REQUIRED' } });
      // no destination: refused — the owner's Personal payout account is NOT used as a fallback
      await expect(wallets.requestBusinessWithdrawal(ctx, 100)).rejects.toMatchObject({ response: { code: 'PAYOUT_DESTINATION_REQUIRED' } });
      expect(await balanceOf(wA.id)).toBe(1000);

      process.env.PAYOUT_DESTINATION_COOLING_OFF_SECONDS = '0';
      const d = await destinations.create(ctx, dto);
      await destinations.verify(admin.id, d.id, {});
      const tx = await wallets.requestBusinessWithdrawal(ctx, 400);
      expect(tx.payoutDestinationId).toBe(d.id);
      expect(tx.payoutSnapshot).toMatchObject({ kind: 'BUSINESS_WORKSPACE', workspaceId: A.workspace.id, accountName: 'Acme Ltd', accountNumber: '0123456789' });
      expect(JSON.stringify(tx.payoutSnapshot)).not.toContain('0711111111'); // never the owner's Personal payout account
      expect(await balanceOf(wA.id)).toBe(600);
      // a later destination change cannot redirect the pending withdrawal
      const d2 = await destinations.create(ctx, { ...dto, accountName: 'Other', accountNumber: '5555555555' });
      await destinations.verify(admin.id, d2.id, {});
      const stored = (await q(`SELECT "payoutSnapshot" FROM wallet_transaction WHERE id=$1`, [tx.id]))[0].payoutSnapshot;
      expect(stored.accountNumber).toBe('0123456789');
      await expect(wallets.requestBusinessWithdrawal(ctx, 100000)).rejects.toThrow(/Insufficient/);
    });

    it('Personal withdrawal keeps User.payout* (snapshot recorded) and cannot be issued from a Business wallet', async () => {
      if (!reachable) return;
      const p = await makeUser('PW', { payoutMethod: 'mpesa', payoutAccountName: 'PW Name', payoutAccountNumber: '0722222222' } as any);
      const w = await wallets.getOrCreatePersonalWallet(p.id);
      await ds.transaction((m) => wallets.creditWallet(m, w.id, 50, { type: 'credit_escrow_release' as any }));
      const tx = await wallets.requestPersonalWithdrawal(p.id, 20);
      expect(tx.payoutSnapshot).toMatchObject({ kind: 'PERSONAL_USER', userId: p.id, accountNumber: '0722222222' });
      expect(tx.payoutDestinationId).toBeNull();
    });
  });

  // ── wallet controller: revoked / wrong RoleContext ────────────────────────
  describe('wallet controller fails closed', () => {
    it('BUSINESS context: an authorization failure propagates (no fallback to the user\'s own wallet)', async () => {
      if (!reachable) return;
      const walletService: any = { getWalletForContext: jest.fn(), requestBusinessWithdrawal: jest.fn(), requestPersonalWithdrawal: jest.fn() };
      const sellerScope: any = { resolve: jest.fn().mockRejectedValue(new Error('not authorized')) };
      const c = new WalletController(walletService, sellerScope);
      const ctx: any = { identityType: 'BUSINESS', workspaceId: 1, userId: 5 };
      await expect(c.getWallet({ user: { id: 5 } }, ctx)).rejects.toThrow('not authorized');
      await expect(c.withdraw({ user: { id: 5 } }, ctx, 10 as any)).rejects.toThrow('not authorized');
      expect(walletService.getWalletForContext).not.toHaveBeenCalled();
      expect(walletService.requestPersonalWithdrawal).not.toHaveBeenCalled();
    });

    it('legacy context: a revoked/expired session (RoleContextException) is never swallowed; a plain refusal means the caller\'s own wallet', async () => {
      if (!reachable) return;
      const walletService: any = { getWalletForContext: jest.fn().mockResolvedValue({ ok: true }) };
      const revoked: any = { resolve: jest.fn().mockRejectedValue(new RoleContextException('ROLE_CONTEXT_REVOKED')) };
      const ctx: any = { identityType: 'PERSONAL', workspaceId: null, userId: 5 };
      await expect(new WalletController(walletService, revoked).getWallet({ user: { id: 5 } }, ctx)).rejects.toBeInstanceOf(RoleContextException);
      expect(walletService.getWalletForContext).not.toHaveBeenCalled();
      const refused: any = { resolve: jest.fn().mockRejectedValue(new NoTeamMembershipException('no membership')) };
      await new WalletController(walletService, refused).getWallet({ user: { id: 5 } }, ctx);
      expect(walletService.getWalletForContext).toHaveBeenCalledWith({ identityType: 'PERSONAL', workspaceId: null, userId: 5 });
    });
  });

  // ── lifecycle guard: user deletion ────────────────────────────────────────
  describe('deletion hardening (application side)', () => {
    it('UsersService.remove refuses (409 USER_HAS_FINANCIAL_HISTORY) for a user with finance history and still deletes a clean user', async () => {
      if (!reachable) return;
      const svc: any = Object.create(UsersService.prototype);
      svc.userRepo = { findOne: (o: any) => repo(User).findOne(o), remove: (u: any) => repo(User).remove(u), manager: ds.manager };
      const withHistory = await makeUser('DelHist');
      await wallets.getOrCreatePersonalWallet(withHistory.id);
      await expect(svc.remove(withHistory.id)).rejects.toMatchObject({ response: { code: 'USER_HAS_FINANCIAL_HISTORY', userId: withHistory.id } });
      expect(await repo(User).findOne({ where: { id: withHistory.id } })).toBeTruthy();
      const clean = await makeUser('DelClean');
      await expect(svc.remove(clean.id)).resolves.toMatchObject({ message: expect.stringContaining('deleted') });
    });
  });

  // ── creation authority / billing resolution ───────────────────────────────
  describe('creation authority', () => {
    const scopeOf = (over: Partial<SellerScope>): SellerScope => ({ legacySellerId: 1, workspaceId: null, mode: 'legacy', ...over } as SellerScope);

    it('createSale stamps the acting workspace from the scope; a product of another Business (same owner) is refused; a legacy scope cannot sell a Business product', async () => {
      if (!reachable) return;
      const created: any[] = [];
      const products: Record<number, any> = { 1: { id: 1, seller: { id: 7 }, workspaceId: 11, availableInStore: true, displayPrice: 10 }, 2: { id: 2, seller: { id: 7 }, workspaceId: 12, availableInStore: true, displayPrice: 10 }, 3: { id: 3, seller: { id: 7 }, workspaceId: null, availableInStore: true, displayPrice: 10 } };
      const manager: any = {
        getRepository: (E: any) => E.name === 'Product' ? { findOne: async ({ where }: any) => products[where.id] } : E.name === 'SaleItem' ? { create: (d: any) => d } : { create: (d: any) => { created.push(d); return d; }, save: async (d: any) => { throw new Error('stop-after-create'); } },
      };
      const svc: any = Object.create(SalesService.prototype);
      svc.dataSource = { transaction: (cb: any) => cb(manager) };
      svc.invoices = { generateReceiptNumber: async () => 'R-1' };
      const dtoBase: any = { channel: 'local_pos', items: [{ productId: 1, quantity: 1 }], paymentMethod: 'cash', amountPaid: 10 };
      const scopeA = scopeOf({ legacySellerId: 7, workspaceId: 11, businessId: 100, mode: 'workspace' });
      await expect(svc.createSale(7, 7, dtoBase, scopeA)).rejects.toThrow('stop-after-create');
      expect(created[0].workspaceId).toBe(11); // stamped from the RoleContext scope
      await expect(svc.createSale(7, 7, { ...dtoBase, items: [{ productId: 2, quantity: 1 }] }, scopeA)).rejects.toMatchObject({ response: { code: 'BUSINESS_SCOPE_MISMATCH' } });
      await expect(svc.createSale(7, 7, dtoBase, scopeOf({ legacySellerId: 7 }))).rejects.toMatchObject({ response: { code: 'BUSINESS_SCOPE_MISMATCH' } }); // legacy Seller never becomes a Business
      created.length = 0;
      await expect(svc.createSale(7, 7, { ...dtoBase, items: [{ productId: 3, quantity: 1 }] }, scopeOf({ legacySellerId: 7 }))).rejects.toThrow('stop-after-create');
      expect(created[0].workspaceId).toBeNull(); // Personal/legacy stays NULL
    });

    it('createOnBehalf ignores a client-supplied commerceProfileId/workspace, stamps only when the product belongs to the acting workspace, and refuses another Business\'s product', async () => {
      if (!reachable) return;
      const captured: any[] = [];
      const svc: any = Object.create(OrdersService.prototype);
      const product: any = { id: 5, seller: { id: 7 }, workspaceId: 11, commerceProfileId: 900, isAvailable: true, stock: 5, basePrice: 10, deliveryFee: 0, shippingMethod: 'agent', name: 'P' };
      svc.productsService = { findOne: async () => product };
      svc.commerceProfiles = { findById: async (id: number) => ({ id, displayName: `profile-${id}` }) };
      svc.repo = { create: (d: any) => { captured.push(d); return d; }, save: async () => { throw new Error('stop-after-create'); } };
      const scopeA = scopeOf({ legacySellerId: 7, workspaceId: 11, businessId: 100, mode: 'workspace', commerceProfileId: 501 });
      const dtoIn: any = { productId: 5, quantity: 1, buyerName: 'B', buyerPhone: '0700', deliveryAddress: 'x', commerceProfileId: 999, workspaceId: 999, businessId: 999 };
      await expect(svc.createOnBehalf({ id: 7, name: 'S' }, dtoIn, scopeA)).rejects.toThrow('stop-after-create');
      expect(captured[0].workspaceId).toBe(11);
      expect(captured[0].commerceProfileId).toBe(501); // the RoleContext actor, not the spoofed 999
      // Business B (same owner) cannot create an order on A's product
      const scopeB = scopeOf({ legacySellerId: 7, workspaceId: 12, businessId: 101, mode: 'workspace', commerceProfileId: 502 });
      await expect(svc.createOnBehalf({ id: 7, name: 'S' }, dtoIn, scopeB)).rejects.toMatchObject({ response: { code: 'BUSINESS_SCOPE_MISMATCH' } });
      // legacy scope: cannot use a Business-stamped product
      await expect(svc.createOnBehalf({ id: 7, name: 'S' }, dtoIn, scopeOf({ legacySellerId: 7 }))).rejects.toMatchObject({ response: { code: 'BUSINESS_SCOPE_MISMATCH' } });
    });

    it('billing SellerProfile comes from the exact acting role: Business role -> its SellerProfile, legacy role -> the legacy one, mismatch fails closed, admin has none', async () => {
      if (!reachable) return;
      const bob = await makeUser('BobBilling');
      const biz = await makeBusiness(bob, 'BB');
      const spLegacy = (await q(`INSERT INTO seller_profile ("userId","businessName","sellerType",status) VALUES ($1,'legacy','individual','approved') RETURNING id`, [bob.id]))[0].id;
      const spBiz = (await q(`INSERT INTO seller_profile ("userId","businessId","businessName","sellerType",status) VALUES ($1,$2,'biz','business','approved') RETURNING id`, [bob.id, biz.business.id]))[0].id;
      const svc: any = Object.create(SuperAgentsService.prototype);
      svc.sellerProfileRepo = repo('SellerProfile' as any) && ds.getRepository('SellerProfile');
      const resolve = (scope: any) => svc.resolveBillingSellerProfile({ id: bob.id }, scope);
      expect((await resolve({ profileType: 'seller_profile', profileId: spBiz, businessId: biz.business.id })).id).toBe(spBiz);
      expect((await resolve({ profileType: 'seller_profile', profileId: spLegacy, businessId: null })).id).toBe(spLegacy);
      await expect(resolve({ profileType: 'seller_profile', profileId: spBiz, businessId: null })).rejects.toMatchObject({ response: { code: 'BILLING_PROFILE_MISMATCH' } });
      await expect(resolve({ profileType: 'seller_profile', profileId: spLegacy, businessId: biz.business.id })).rejects.toMatchObject({ response: { code: 'BILLING_PROFILE_MISMATCH' } });
      const other = await makeUser('OtherBilling');
      await expect((svc.resolveBillingSellerProfile({ id: other.id }, { profileType: 'seller_profile', profileId: spBiz, businessId: biz.business.id }))).rejects.toMatchObject({ response: { code: 'BILLING_PROFILE_MISMATCH' } });
      expect(await resolve({ profileType: null, profileId: null })).toBeNull(); // admin/manager acting: no billing profile
      expect(await resolve(undefined)).toBeNull();
    });
  });
});
