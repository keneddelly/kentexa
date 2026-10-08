import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Receipt credentials are minted at verified desk intake, independently of
 * customer claim challenges. No plaintext secret or sender phone is stored.
 */
export class AddShipmentClaimReceipts1791511200000 implements MigrationInterface {
  name = 'AddShipmentClaimReceipts1791511200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.shipment_claim_receipt (
        "shipmentId" integer PRIMARY KEY REFERENCES public.shipment(id) ON DELETE CASCADE,
        "receiptSecretDigest" varchar(64) NOT NULL,
        "issuedByUserId" integer NOT NULL,
        "issuedAt" timestamptz NOT NULL DEFAULT now(),
        "expiresAt" timestamptz NOT NULL,
        "consumedAt" timestamptz
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_shipment_claim_receipt_expiry"
      ON public.shipment_claim_receipt ("expiresAt")
      WHERE "consumedAt" IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS public.shipment_claim_receipt');
  }
}
