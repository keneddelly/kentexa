import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHumanSizeLogisticsPricing1788293400000 implements MigrationInterface {
  name = 'AddHumanSizeLogisticsPricing1788293400000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE "public"."logistics_agent_pricing_sizeclass_enum" AS ENUM('small','standard','large','special')`);
    await q.query(`CREATE TABLE "logistics_agent_pricing" ("sizeClass" "public"."logistics_agent_pricing_sizeclass_enum" NOT NULL, "pickupFee" numeric(12,2), "deliveryFee" numeric(12,2), "requiresManualQuote" boolean NOT NULL DEFAULT false, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_logistics_agent_pricing_size" PRIMARY KEY ("sizeClass"))`);
    await q.query(`ALTER TABLE "transport_route" ADD "priceSmall" numeric(12,2)`);
    await q.query(`ALTER TABLE "transport_route" ADD "priceStandard" numeric(12,2)`);
    await q.query(`ALTER TABLE "transport_route" ADD "priceLarge" numeric(12,2)`);
    await q.query(`ALTER TABLE "transport_route" ADD "priceSpecial" numeric(12,2)`);
    await q.query(`INSERT INTO "logistics_agent_pricing" ("sizeClass","pickupFee","deliveryFee","requiresManualQuote") VALUES ('small',2000,2000,false),('standard',NULL,NULL,false),('large',NULL,NULL,false),('special',NULL,NULL,true)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "transport_route" DROP COLUMN "priceSpecial"`);
    await q.query(`ALTER TABLE "transport_route" DROP COLUMN "priceLarge"`);
    await q.query(`ALTER TABLE "transport_route" DROP COLUMN "priceStandard"`);
    await q.query(`ALTER TABLE "transport_route" DROP COLUMN "priceSmall"`);
    await q.query(`DROP TABLE "logistics_agent_pricing"`);
    await q.query(`DROP TYPE "public"."logistics_agent_pricing_sizeclass_enum"`);
  }
}
