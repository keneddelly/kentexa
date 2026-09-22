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
import { MoneyRoutingService } from './money-routing.service';
import { OrderReleaseService } from './order-release.service';
import { PaymentEvidenceService } from '../payments/payment-evidence.service';
import { computeEvidenceSeal } from '../payments/payment-evidence';
import { OwnershipFeatureFlagsService } from '../ownership/ownership-feature-flags.service';
import { Business, BusinessStatus } from '../business/entities/business.entity';
import { OperationalWorkspace, OperationalWorkspaceStatus } from '../business/entities/operational-workspace.entity';
import { BusinessMembership, BusinessMembershipRoleTemplate, BusinessMembershipStatus } from '../business/entities/business-membership.entity';
import { WorkspaceAssignment, WorkspaceAssignmentStatus } from '../business/entities/workspace-assignment.entity';
import { BusinessCapability, BusinessCapabilityCode, BusinessCapabilityStatus } from '../business/entities/business-capability.entity';
import { User } from '../users/entities/user.entity';
import { MoneyRoutingEntry } from './entities/money-routing-entry.entity';
import { PayoutDestination } from '../wallet/entities/payout-destination.entity';

/**
 * Shared real-Postgres harness for the I2G release tests: a pre-I2G production-shaped money
 * schema (with the order columns the release writers touch), then the ACTUAL six I2G migrations.
 */
export interface ReleaseHarness {
  reachable: boolean;
  ds: DataSource;
  wallets: WalletService;
  routing: MoneyRoutingService;
  release: OrderReleaseService;
  q: (sql: string, params?: any[]) => Promise<any>;
  makeUser: (name: string) => Promise<User>;
  makeBusiness: (owner: User, name: string, opts?: { selling?: boolean }) => Promise<{ business: Business; workspace: OperationalWorkspace }>;
  makeProduct: (sellerId: number, workspaceId: number | null) => Promise<number>;
  makeOrder: (o: Partial<{ sellerId: number | null; workspaceId: number | null; productId: number | null; source: string; status: string; paymentStatus: string; escrowStatus: string | null; sellerAmount: number; totalAmount: number; paymentMethod: string; codUpfrontAmount: number | null; buyerId: number | null; deliveredAt: Date | null; autoReleaseAt: Date | null }>) => Promise<number>;
  /** A SUCCESS payment row for the given order, so PaymentEvidenceService.check() finds real evidence. */
  makePayment: (orderId: number, amountMinor: number, opts?: { status?: string; provider?: string; providerReference?: string }) => Promise<number>;
  balanceOf: (walletId: number) => Promise<number>;
  totalCredited: () => Promise<number>;
  ledgerRows: (orderId: number) => Promise<any[]>;
  orderRow: (orderId: number) => Promise<any>;
  entryOf: (orderId: number) => Promise<any>;
  destroy: () => Promise<void>;
}

export async function setupReleaseHarness(): Promise<ReleaseHarness> {
  const config = getB5BTestConnectionConfig();
  const reachable = !!config;
  if (!config) {
    return { reachable } as unknown as ReleaseHarness;
  }
  const client = new Client(config);
  await client.connect();
  await resetB5BTestSchema(client);
  await client.end();
  await bootstrapB5BTestSchema(config);
  const ds = new DataSource({
    type: 'postgres', host: config.host, port: config.port, username: config.user,
    password: config.password, database: config.database, synchronize: false,
    entities: [...B5B_ALL_ENTITIES, Wallet, WalletTransaction, MoneyRoutingEntry, PayoutDestination],
  });
  await ds.initialize();
  const q = (sql: string, params: any[] = []) => ds.query(sql, params);
  const repo = (e: any) => ds.getRepository(e) as any;
  let seq = 0;

  await q(`CREATE TABLE product (id serial PRIMARY KEY, "sellerId" int REFERENCES "user"(id) ON DELETE CASCADE, "workspaceId" int REFERENCES operational_workspace(id) ON DELETE SET NULL)`);
  await q(`CREATE TABLE "order" (
    id serial PRIMARY KEY, "sellerId" int, "productId" int REFERENCES product(id), "buyerId" int, source varchar, "trackingNumber" varchar,
    status varchar, "paymentStatus" varchar, "escrowStatus" varchar, "payoutStatus" varchar, "paymentMethod" varchar,
    "sellerAmount" numeric(12,2) NOT NULL DEFAULT 0, "totalAmount" numeric(12,2) NOT NULL DEFAULT 0, "codUpfrontAmount" numeric(12,2),
    "buyerConfirmedAt" timestamp, "deliveredAt" timestamp, "completedAt" timestamp, "confirmationToken" varchar,
    "buyerRating" int, "buyerReview" text, "reviewedAt" timestamp, "superAgentRating" int, "superAgentReview" text,
    "transportRating" int, "transportReview" text, "autoConfirmed" boolean, "autoConfirmAt" timestamp,
    "disputeResolution" text, "fundsReleasedAt" timestamp, "autoReleaseAt" timestamp)`);
  await q(`ALTER TABLE "order" ADD CONSTRAINT "FK_8a583acc24e13bcf84b1b9d0d20" FOREIGN KEY ("sellerId") REFERENCES "user"(id) ON DELETE SET NULL`);
  await q(`CREATE TABLE sale (id serial PRIMARY KEY, "sellerId" int NOT NULL, "createdAt" timestamp DEFAULT now())`);
  await q(`ALTER TABLE sale ADD CONSTRAINT "FK_8107fa8e7838a1882adab4564be" FOREIGN KEY ("sellerId") REFERENCES "user"(id) ON DELETE CASCADE`);
  // S0 x I2G integration gate: OrderReleaseService now independently re-checks PaymentEvidence
  // before routing/committing (see order-release.service.ts) -- a minimal `payment` table so that
  // check (raw SQL only, no ORM entity metadata needed) resolves against this disposable schema too.
  await q(`CREATE TABLE payment (id serial PRIMARY KEY, status varchar, provider varchar, "orderId" int, "providerReference" varchar, metadata jsonb)`);
  await q(`CREATE TABLE wallet (id serial PRIMARY KEY, "userId" int NOT NULL, balance numeric(12,2) NOT NULL DEFAULT 0, "pendingBalance" numeric(12,2) NOT NULL DEFAULT 0, "totalEarned" numeric(12,2) NOT NULL DEFAULT 0, "totalWithdrawn" numeric(12,2) NOT NULL DEFAULT 0, currency varchar NOT NULL DEFAULT 'TZS', "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now())`);
  await q(`ALTER TABLE wallet ADD CONSTRAINT "REL_35472b1fe48b6330cd34970956" UNIQUE ("userId")`);
  await q(`ALTER TABLE wallet ADD CONSTRAINT "FK_35472b1fe48b6330cd349709564" FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE`);
  await q(`CREATE TABLE wallet_transaction (id serial PRIMARY KEY, "walletId" int NOT NULL REFERENCES wallet(id) ON DELETE CASCADE, type varchar NOT NULL, amount numeric(12,2) NOT NULL, "balanceAfter" numeric(12,2) NOT NULL, "referenceType" varchar, "referenceId" int, status varchar NOT NULL DEFAULT 'completed', note text, "createdAt" timestamp NOT NULL DEFAULT now())`);
  await q(`CREATE TABLE payout (id serial PRIMARY KEY, "sellerId" int NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, "orderId" int REFERENCES "order"(id) ON DELETE CASCADE)`);
  await q(`CREATE TABLE invoice (id serial PRIMARY KEY, "orderId" int REFERENCES "order"(id) ON DELETE CASCADE, "buyerId" int REFERENCES "user"(id) ON DELETE CASCADE, "invoiceNumber" varchar)`);
  await q(`CREATE TABLE classified_invoice_request (id serial PRIMARY KEY, "classifiedId" int REFERENCES classified(id) ON DELETE CASCADE, "orderRefId" int REFERENCES "order"(id) ON DELETE SET NULL, "sellerId" int REFERENCES "user"(id) ON DELETE CASCADE, "buyerId" int REFERENCES "user"(id) ON DELETE CASCADE)`);

  const runner = ds.createQueryRunner();
  await runner.connect();
  for (const m of [
    new AddWorkspaceOwnershipToOrderAndSale1788264000000(), new AddWalletXorOwnership1788264600000(),
    new AddMoneyRoutingEntry1788265200000(), new AddPayoutDestination1788265800000(),
    new AddFinancialReconciliationJournal1788266400000(), new HardenFinancialHistoryForeignKeys1788267000000(),
  ]) await m.up(runner);
  await runner.release();

  const flags = new OwnershipFeatureFlagsService();
  const destinations = new PayoutDestinationService(ds, new PayoutPolicyService(), flags);
  const wallets = new WalletService(repo(Wallet), repo(WalletTransaction), repo(User), ds, { getLevel: jest.fn().mockResolvedValue(1) } as any, destinations, flags);
  const routing = new MoneyRoutingService(ds, wallets, flags);
  // PaymentEvidenceService only ever calls `.query(sql, params)` on what it's given -- the raw
  // DataSource itself satisfies that structurally, without registering a mapped Payment entity.
  const paymentEvidence = new PaymentEvidenceService(ds as any);
  const release = new OrderReleaseService(ds, routing, paymentEvidence);
  if (!process.env.PAYMENT_EVIDENCE_SEAL_KEY) process.env.PAYMENT_EVIDENCE_SEAL_KEY = 'i2g-release-harness-test-seal-key';

  const makeUser = async (name: string) => {
    const n = ++seq;
    return repo(User).save(repo(User).create({ email: `u${n}@i2gr.local`, phone: `+2559${String(n).padStart(8, '0')}`, password: 'x', name }));
  };
  const makeBusiness = async (owner: User, name: string, opts: { selling?: boolean } = {}) => {
    const business = await repo(Business).save(repo(Business).create({ legalName: `${name} Ltd`, tradingName: name, user: owner, status: BusinessStatus.ACTIVE }));
    const workspace = await repo(OperationalWorkspace).save(repo(OperationalWorkspace).create({ businessId: business.id, name: 'Default Operations', isDefault: true, status: OperationalWorkspaceStatus.ACTIVE }));
    const membership = await repo(BusinessMembership).save(repo(BusinessMembership).create({ businessId: business.id, userId: owner.id, roleTemplate: BusinessMembershipRoleTemplate.OWNER, status: BusinessMembershipStatus.ACTIVE }));
    await repo(WorkspaceAssignment).save(repo(WorkspaceAssignment).create({ businessMembershipId: membership.id, workspaceId: workspace.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {} }));
    if (opts.selling) {
      await repo(BusinessCapability).save(repo(BusinessCapability).create({ workspaceId: workspace.id, capabilityCode: BusinessCapabilityCode.COMMERCE, status: BusinessCapabilityStatus.ACTIVE, approvedAt: new Date() }));
    }
    return { business, workspace };
  };
  const makeProduct = async (sellerId: number, workspaceId: number | null) =>
    (await q(`INSERT INTO product ("sellerId","workspaceId") VALUES ($1,$2) RETURNING id`, [sellerId, workspaceId]))[0].id as number;
  const makeOrder: ReleaseHarness['makeOrder'] = async (o) =>
    (await q(
      `INSERT INTO "order" ("sellerId","workspaceId","productId","buyerId",source,status,"paymentStatus","escrowStatus","sellerAmount","totalAmount","paymentMethod","codUpfrontAmount","deliveredAt","autoReleaseAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [o.sellerId ?? null, o.workspaceId ?? null, o.productId ?? null, o.buyerId ?? null, o.source ?? 'online', o.status ?? 'delivered', o.paymentStatus ?? 'paid',
        o.escrowStatus === undefined ? 'holding' : o.escrowStatus, o.sellerAmount ?? 1000,
        // Defaults to 0 (matches this harness's pre-existing behaviour): PaymentEvidence's derived
        // obligation is then 0, so the release-time evidence check is a no-op pass for every routing/
        // ownership test here that doesn't care about it. Tests that DO care set totalAmount + makePayment.
        o.totalAmount ?? 0, o.paymentMethod ?? 'online', o.codUpfrontAmount ?? null, o.deliveredAt ?? null, o.autoReleaseAt ?? null],
    ))[0].id as number;

  // A sealed, valid SUCCESS evidence row for `orderId` -- see payment-evidence.ts's isValidEvidenceRow.
  // The seal binds the row's own DB-assigned id, so it must be computed AFTER insertion (matching
  // how PaymentConfirmationService does it against a real Payment row) -- an id used before it exists
  // would produce a seal that never verifies.
  const makePayment: ReleaseHarness['makePayment'] = async (orderId, amountMinor, opts = {}) => {
    const provider = opts.provider ?? 'clickpesa';
    const providerReference = opts.providerReference ?? `HARNESS-REF-${orderId}-${++seq}`;
    const status = opts.status ?? 'success';
    const inserted = await q(
      `INSERT INTO payment (status, provider, "orderId", "providerReference") VALUES ($1,$2,$3,$4) RETURNING id`,
      [status, provider, orderId, providerReference],
    );
    const id = inserted[0].id as number;
    const seal = computeEvidenceSeal({
      paymentId: id,
      orderId,
      invoiceNumber: null,
      amountMinor,
      currency: 'TZS',
      provider,
      providerReference,
      purpose: 'ORDER_FULL',
    });
    const metadata = JSON.stringify({ purpose: 'ORDER_FULL', currency: 'TZS', amountMinor, orderId, invoiceNumber: null, seal });
    await q(`UPDATE payment SET metadata = $2::jsonb WHERE id = $1`, [id, metadata]);
    return id;
  };

  return {
    reachable, ds, wallets, routing, release, q, makeUser, makeBusiness, makeProduct, makeOrder, makePayment,
    balanceOf: async (id) => Number((await q(`SELECT balance FROM wallet WHERE id=$1`, [id]))[0].balance),
    totalCredited: async () => Number((await q(`SELECT coalesce(sum(amount),0) s FROM wallet_transaction WHERE type='credit_escrow_release'`))[0].s),
    ledgerRows: (orderId) => q(`SELECT * FROM wallet_transaction WHERE "referenceType"='order' AND "referenceId"=$1`, [orderId]),
    orderRow: async (id) => (await q(`SELECT * FROM "order" WHERE id=$1`, [id]))[0],
    entryOf: async (orderId) => (await q(`SELECT * FROM money_routing_entry WHERE "eventKey"=$1`, [`ORDER:${orderId}:SELLER_PROCEEDS`]))[0],
    destroy: async () => { if (ds.isInitialized) await ds.destroy(); },
  };
}
