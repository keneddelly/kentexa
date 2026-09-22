import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * I2G stage A. Append-only rollback journal for any future, separately
 * approved workspace reconciliation. This migration creates the table only;
 * nothing writes to it until a reconciliation is explicitly run.
 */
export class AddFinancialReconciliationJournal1788266400000 implements MigrationInterface {
  name = 'AddFinancialReconciliationJournal1788266400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE public.financial_reconciliation_journal (
        id serial PRIMARY KEY,
        "runId" varchar NOT NULL,
        "entityType" varchar NOT NULL,
        "entityId" integer NOT NULL,
        "previousWorkspaceId" integer,
        "newWorkspaceId" integer NOT NULL,
        rule varchar NOT NULL,
        evidence jsonb,
        "appliedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CK_fin_recon_entity" CHECK ("entityType" IN ('order','sale')),
        CONSTRAINT "FK_fin_recon_new_workspace" FOREIGN KEY ("newWorkspaceId") REFERENCES public.operational_workspace(id) ON DELETE RESTRICT
      )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_fin_recon_run_entity" ON public.financial_reconciliation_journal ("runId", "entityType", "entityId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const n = await queryRunner.query(`SELECT count(*)::int AS n FROM public.financial_reconciliation_journal`);
    if (n[0].n > 0) throw new Error('I2G journal down refused: journal rows exist');
    await queryRunner.query(`DROP TABLE public.financial_reconciliation_journal`);
  }
}
