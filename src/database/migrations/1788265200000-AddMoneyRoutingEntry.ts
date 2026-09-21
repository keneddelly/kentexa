import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * I2G stage A. Durable financial-routing entry (transactional outbox +
 * idempotency record) and the ledger columns that reference it.
 *
 * Idempotency is by a canonical, immutable EVENT KEY (UNIQUE), e.g.
 * 'ORDER:<orderId>:SELLER_PROCEEDS'. It is NOT keyed by orderId alone: an
 * order may legitimately have several financial events over its life (refund,
 * partial refund, adjustment, reversal), each with its own event key.
 * Observations (webhook / escrow release / COD / invoice-paid) are recorded
 * as metadata on the entry and converge on the same event key.
 * wallet_transaction.routingEntryId is UNIQUE: at most one ledger row per entry.
 */
export class AddMoneyRoutingEntry1788265200000 implements MigrationInterface {
  name = 'AddMoneyRoutingEntry1788265200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE public.money_routing_entry (
        id serial PRIMARY KEY,
        "eventKey" varchar NOT NULL,
        "eventType" varchar NOT NULL,
        "orderId" integer NOT NULL,
        amount numeric(12,2) NOT NULL,
        "targetType" varchar NOT NULL,
        "targetWorkspaceId" integer,
        "targetUserId" integer,
        state varchar NOT NULL,
        "blockReason" varchar,
        "blockDetail" jsonb,
        observations jsonb NOT NULL DEFAULT '[]'::jsonb,
        attempts integer NOT NULL DEFAULT 0,
        "nextAttemptAt" timestamptz,
        "lastError" text,
        "walletTransactionId" integer,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "routedAt" timestamptz,
        "resolvedByUserId" integer,
        "resolutionNote" text,
        CONSTRAINT "UQ_money_routing_event_key" UNIQUE ("eventKey"),
        CONSTRAINT "CK_money_routing_amount" CHECK (amount > 0),
        CONSTRAINT "CK_money_routing_state" CHECK (state IN ('PENDING','ROUTED','BLOCKED','CANCELLED')),
        CONSTRAINT "CK_money_routing_target" CHECK (
          ("targetType" = 'BUSINESS_WORKSPACE' AND "targetWorkspaceId" IS NOT NULL AND "targetUserId" IS NULL)
          OR ("targetType" = 'PERSONAL_USER' AND "targetUserId" IS NOT NULL AND "targetWorkspaceId" IS NULL)
          OR ("targetType" = 'UNRESOLVED' AND "targetWorkspaceId" IS NULL AND "targetUserId" IS NULL)),
        CONSTRAINT "CK_money_routing_routed" CHECK (state <> 'ROUTED' OR "walletTransactionId" IS NOT NULL),
        CONSTRAINT "CK_money_routing_blocked" CHECK (state <> 'BLOCKED' OR "blockReason" IS NOT NULL),
        CONSTRAINT "FK_money_routing_order" FOREIGN KEY ("orderId") REFERENCES public."order"(id) ON DELETE RESTRICT,
        CONSTRAINT "FK_money_routing_workspace" FOREIGN KEY ("targetWorkspaceId") REFERENCES public.operational_workspace(id) ON DELETE RESTRICT,
        CONSTRAINT "FK_money_routing_user" FOREIGN KEY ("targetUserId") REFERENCES public."user"(id) ON DELETE RESTRICT,
        CONSTRAINT "FK_money_routing_resolved_by" FOREIGN KEY ("resolvedByUserId") REFERENCES public."user"(id) ON DELETE RESTRICT
      )`);
    await queryRunner.query(`CREATE INDEX "IDX_money_routing_order" ON public.money_routing_entry ("orderId")`);
    await queryRunner.query(`CREATE INDEX "IDX_money_routing_state_next" ON public.money_routing_entry (state, "nextAttemptAt")`);

    await queryRunner.query(`
      ALTER TABLE public.wallet_transaction
        ADD COLUMN "routingEntryId" integer,
        ADD COLUMN "payoutDestinationId" integer,
        ADD COLUMN "payoutSnapshot" jsonb`);
    await queryRunner.query(`
      ALTER TABLE public.wallet_transaction
        ADD CONSTRAINT "UQ_wallet_transaction_routing_entry" UNIQUE ("routingEntryId"),
        ADD CONSTRAINT "FK_wallet_transaction_routing_entry" FOREIGN KEY ("routingEntryId") REFERENCES public.money_routing_entry(id) ON DELETE RESTRICT`);
    await queryRunner.query(`
      ALTER TABLE public.money_routing_entry
        ADD CONSTRAINT "FK_money_routing_wallet_transaction" FOREIGN KEY ("walletTransactionId")
        REFERENCES public.wallet_transaction(id) ON DELETE RESTRICT`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const n = await queryRunner.query(`SELECT count(*)::int AS n FROM public.money_routing_entry`);
    if (n[0].n > 0) throw new Error('I2G money_routing_entry down refused: entries exist; restore-forward instead');
    await queryRunner.query(`ALTER TABLE public.money_routing_entry DROP CONSTRAINT "FK_money_routing_wallet_transaction"`);
    await queryRunner.query(`
      ALTER TABLE public.wallet_transaction
        DROP CONSTRAINT "FK_wallet_transaction_routing_entry",
        DROP CONSTRAINT "UQ_wallet_transaction_routing_entry",
        DROP COLUMN "payoutSnapshot", DROP COLUMN "payoutDestinationId", DROP COLUMN "routingEntryId"`);
    await queryRunner.query(`DROP TABLE public.money_routing_entry`);
  }
}
