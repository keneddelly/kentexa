import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * I2G stage A. Workspace-scoped, append-only Business payout destination.
 * Never copied from User.payout*. At most ONE active destination per
 * workspace (partial unique). A change inserts a new row; existing rows only
 * move through lifecycle status/timestamps. The cooling-off duration is NOT a
 * schema constant: `usableFrom` and `coolingOffSeconds` record what
 * configuration applied at verification time.
 */
export class AddPayoutDestination1788265800000 implements MigrationInterface {
  name = 'AddPayoutDestination1788265800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE public.payout_destination (
        id serial PRIMARY KEY,
        "workspaceId" integer NOT NULL,
        method varchar NOT NULL,
        "accountName" varchar NOT NULL,
        "accountNumber" varchar NOT NULL,
        "bankName" varchar,
        status varchar NOT NULL,
        "usableFrom" timestamptz,
        "coolingOffSeconds" integer,
        "verificationMethod" varchar,
        "verificationRef" varchar,
        "createdByUserId" integer NOT NULL,
        "verifiedByUserId" integer,
        "disabledByUserId" integer,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "verifiedAt" timestamptz,
        "disabledAt" timestamptz,
        CONSTRAINT "CK_payout_destination_status" CHECK (status IN ('pending_verification','active','disabled','superseded')),
        CONSTRAINT "CK_payout_destination_active_verified" CHECK (status <> 'active' OR ("verifiedAt" IS NOT NULL AND "usableFrom" IS NOT NULL)),
        CONSTRAINT "FK_payout_destination_workspace" FOREIGN KEY ("workspaceId") REFERENCES public.operational_workspace(id) ON DELETE RESTRICT,
        CONSTRAINT "FK_payout_destination_created_by" FOREIGN KEY ("createdByUserId") REFERENCES public."user"(id) ON DELETE RESTRICT,
        CONSTRAINT "FK_payout_destination_verified_by" FOREIGN KEY ("verifiedByUserId") REFERENCES public."user"(id) ON DELETE RESTRICT,
        CONSTRAINT "FK_payout_destination_disabled_by" FOREIGN KEY ("disabledByUserId") REFERENCES public."user"(id) ON DELETE RESTRICT
      )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_payout_destination_active" ON public.payout_destination ("workspaceId") WHERE status = 'active'`);
    await queryRunner.query(`CREATE INDEX "IDX_payout_destination_workspace" ON public.payout_destination ("workspaceId", "createdAt")`);
    await queryRunner.query(`
      ALTER TABLE public.wallet_transaction
        ADD CONSTRAINT "FK_wallet_transaction_payout_destination" FOREIGN KEY ("payoutDestinationId")
        REFERENCES public.payout_destination(id) ON DELETE RESTRICT`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const n = await queryRunner.query(`SELECT count(*)::int AS n FROM public.payout_destination`);
    if (n[0].n > 0) throw new Error('I2G payout_destination down refused: destinations exist; restore-forward instead');
    await queryRunner.query(`ALTER TABLE public.wallet_transaction DROP CONSTRAINT "FK_wallet_transaction_payout_destination"`);
    await queryRunner.query(`DROP TABLE public.payout_destination`);
  }
}
