import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * I2G stage A (additive). Nullable `workspaceId` on "order" and sale: the
 * canonical organizational partition of commerce money records (I2 invariant
 * ACTIVE WORKSPACE = AUTHORIZED = RESOURCE = ACCOUNTED). No `businessId` is
 * duplicated -- workspace determines the Business.
 *
 * FK is ON DELETE RESTRICT: durable financial history must never be
 * re-attributed or silently detached by a workspace deletion (contrast with
 * Product/Classified, which use SET NULL).
 *
 * NO data is written: every existing row keeps NULL (legacy). Historical
 * attribution is a separate, human-gated reconciliation and is NOT part of
 * this migration.
 */
export class AddWorkspaceOwnershipToOrderAndSale1788264000000 implements MigrationInterface {
  name = 'AddWorkspaceOwnershipToOrderAndSale1788264000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public."order" ADD COLUMN "workspaceId" integer`);
    await queryRunner.query(`ALTER TABLE public."sale" ADD COLUMN "workspaceId" integer`);
    await queryRunner.query(`
      ALTER TABLE public."order"
        ADD CONSTRAINT "FK_order_workspace" FOREIGN KEY ("workspaceId")
        REFERENCES public.operational_workspace(id) ON DELETE RESTRICT`);
    await queryRunner.query(`
      ALTER TABLE public."sale"
        ADD CONSTRAINT "FK_sale_workspace" FOREIGN KEY ("workspaceId")
        REFERENCES public.operational_workspace(id) ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE INDEX "IDX_order_workspace" ON public."order" ("workspaceId")`);
    await queryRunner.query(`CREATE INDEX "IDX_order_seller_workspace" ON public."order" ("sellerId", "workspaceId")`);
    await queryRunner.query(`CREATE INDEX "IDX_sale_workspace" ON public."sale" ("workspaceId")`);
    await queryRunner.query(`CREATE INDEX "IDX_sale_seller_workspace_created" ON public."sale" ("sellerId", "workspaceId", "createdAt")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX public."IDX_sale_seller_workspace_created"`);
    await queryRunner.query(`DROP INDEX public."IDX_sale_workspace"`);
    await queryRunner.query(`DROP INDEX public."IDX_order_seller_workspace"`);
    await queryRunner.query(`DROP INDEX public."IDX_order_workspace"`);
    await queryRunner.query(`ALTER TABLE public."sale" DROP CONSTRAINT "FK_sale_workspace"`);
    await queryRunner.query(`ALTER TABLE public."order" DROP CONSTRAINT "FK_order_workspace"`);
    await queryRunner.query(`ALTER TABLE public."sale" DROP COLUMN "workspaceId"`);
    await queryRunner.query(`ALTER TABLE public."order" DROP COLUMN "workspaceId"`);
  }
}
