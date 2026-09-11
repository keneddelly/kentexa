import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stage B4.0: additive lifecycle actor metadata for BusinessCapability.
 * No backfill or status/data transition is performed.
 */
export class AddBusinessCapabilityLifecycleAudit1788262200000
  implements MigrationInterface
{
  name = 'AddBusinessCapabilityLifecycleAudit1788262200000';

  private readonly FK_SUSPENDED_BY =
    'FK_business_capability_suspended_by';
  private readonly FK_REACTIVATED_BY =
    'FK_business_capability_reactivated_by';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.business_capability
        ADD COLUMN "suspendedByUserId" integer,
        ADD COLUMN "reactivatedAt" timestamp,
        ADD COLUMN "reactivatedByUserId" integer
    `);

    await queryRunner.query(`
      ALTER TABLE public.business_capability
        ADD CONSTRAINT "${this.FK_SUSPENDED_BY}"
          FOREIGN KEY ("suspendedByUserId")
          REFERENCES public."user"(id) ON DELETE SET NULL,
        ADD CONSTRAINT "${this.FK_REACTIVATED_BY}"
          FOREIGN KEY ("reactivatedByUserId")
          REFERENCES public."user"(id) ON DELETE SET NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.business_capability
        DROP CONSTRAINT "${this.FK_REACTIVATED_BY}",
        DROP CONSTRAINT "${this.FK_SUSPENDED_BY}"
    `);

    await queryRunner.query(`
      ALTER TABLE public.business_capability
        DROP COLUMN "reactivatedByUserId",
        DROP COLUMN "reactivatedAt",
        DROP COLUMN "suspendedByUserId"
    `);
  }
}
