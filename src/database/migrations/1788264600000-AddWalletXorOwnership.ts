import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * I2G stage A. Wallet ownership becomes exactly-one-owner:
 *   Personal: userId NOT NULL, workspaceId NULL
 *   Business: userId NULL,     workspaceId NOT NULL
 * enforced by a CHECK plus partial unique indexes; the previous UNIQUE(userId)
 * is replaced by the Personal-only partial unique so a workspace wallet can
 * coexist with its owner's Personal wallet. Both owner FKs are RESTRICT: a
 * wallet (durable financial ownership) can no longer disappear through a
 * user/workspace deletion.
 *
 * Preflight (throws, never coerces): every existing wallet must have a userId
 * and non-negative amounts; otherwise the migration aborts and nothing changes.
 * No row is rewritten.
 */
export class AddWalletXorOwnership1788264600000 implements MigrationInterface {
  name = 'AddWalletXorOwnership1788264600000';

  private async constraintName(q: QueryRunner, type: 'f' | 'u', table: string, column: string): Promise<string | null> {
    const rows = await q.query(
      `SELECT c.conname FROM pg_constraint c
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.contype = $1 AND array_length(c.conkey, 1) = 1 AND c.conrelid = $2::regclass AND a.attname = $3`,
      [type, table, column],
    );
    return rows[0]?.conname ?? null;
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    const bad = await queryRunner.query(
      `SELECT count(*)::int AS n FROM public.wallet
        WHERE "userId" IS NULL OR balance < 0 OR "pendingBalance" < 0 OR "totalEarned" < 0 OR "totalWithdrawn" < 0`,
    );
    if (bad[0].n > 0) {
      throw new Error(`I2G wallet preflight failed: ${bad[0].n} wallet row(s) have NULL userId or negative amounts`);
    }

    await queryRunner.query(`ALTER TABLE public.wallet ADD COLUMN "workspaceId" integer`);
    await queryRunner.query(`ALTER TABLE public.wallet ALTER COLUMN "userId" DROP NOT NULL`);

    const userFk = await this.constraintName(queryRunner, 'f', 'public.wallet', 'userId');
    if (userFk) await queryRunner.query(`ALTER TABLE public.wallet DROP CONSTRAINT "${userFk}"`);
    const userUnique = await this.constraintName(queryRunner, 'u', 'public.wallet', 'userId');
    if (userUnique) await queryRunner.query(`ALTER TABLE public.wallet DROP CONSTRAINT "${userUnique}"`);

    await queryRunner.query(`
      ALTER TABLE public.wallet
        ADD CONSTRAINT "FK_wallet_user" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE RESTRICT,
        ADD CONSTRAINT "FK_wallet_workspace" FOREIGN KEY ("workspaceId") REFERENCES public.operational_workspace(id) ON DELETE RESTRICT`);
    await queryRunner.query(`
      ALTER TABLE public.wallet ADD CONSTRAINT "CK_wallet_exactly_one_owner"
        CHECK (("userId" IS NOT NULL AND "workspaceId" IS NULL) OR ("userId" IS NULL AND "workspaceId" IS NOT NULL))`);
    await queryRunner.query(`
      ALTER TABLE public.wallet ADD CONSTRAINT "CK_wallet_nonnegative"
        CHECK (balance >= 0 AND "pendingBalance" >= 0 AND "totalEarned" >= 0 AND "totalWithdrawn" >= 0)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_wallet_personal" ON public.wallet ("userId") WHERE "workspaceId" IS NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_wallet_workspace" ON public.wallet ("workspaceId") WHERE "workspaceId" IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const ws = await queryRunner.query(`SELECT count(*)::int AS n FROM public.wallet WHERE "workspaceId" IS NOT NULL`);
    if (ws[0].n > 0) {
      throw new Error('I2G wallet down refused: workspace (Business) wallets exist; restore-forward instead');
    }
    await queryRunner.query(`DROP INDEX public."UQ_wallet_workspace"`);
    await queryRunner.query(`DROP INDEX public."UQ_wallet_personal"`);
    await queryRunner.query(`ALTER TABLE public.wallet DROP CONSTRAINT "CK_wallet_nonnegative"`);
    await queryRunner.query(`ALTER TABLE public.wallet DROP CONSTRAINT "CK_wallet_exactly_one_owner"`);
    await queryRunner.query(`ALTER TABLE public.wallet DROP CONSTRAINT "FK_wallet_workspace"`);
    await queryRunner.query(`ALTER TABLE public.wallet DROP CONSTRAINT "FK_wallet_user"`);
    await queryRunner.query(`ALTER TABLE public.wallet ALTER COLUMN "userId" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE public.wallet ADD CONSTRAINT "REL_35472b1fe48b6330cd34970956" UNIQUE ("userId")`);
    await queryRunner.query(`ALTER TABLE public.wallet ADD CONSTRAINT "FK_35472b1fe48b6330cd349709564" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE public.wallet DROP COLUMN "workspaceId"`);
  }
}
