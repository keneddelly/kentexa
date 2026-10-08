import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Claim challenges are separate from shipment identity and parcel custody.
 * A walk-in stays unowned until an authenticated customer completes both
 * the receipt-secret and sender-phone verification checks.
 *
 * No sender phone, OTP or receipt secret is stored in this table. Digests
 * must be computed with a server-side keyed HMAC, never plain SHA hashes.
 */
export class AddShipmentClaimChallenges1791507600000 implements MigrationInterface {
  name = 'AddShipmentClaimChallenges1791507600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.shipment_claim_challenge (
        id bigserial PRIMARY KEY,
        "shipmentId" integer NOT NULL REFERENCES public.shipment(id) ON DELETE CASCADE,
        "claimantUserId" integer NOT NULL,
        "receiptSecretDigest" varchar(64) NOT NULL,
        "otpDigest" varchar(64),
        "otpExpiresAt" timestamptz,
        "expiresAt" timestamptz NOT NULL,
        "attemptCount" integer NOT NULL DEFAULT 0,
        "maxAttempts" integer NOT NULL DEFAULT 5,
        "consumedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_shipment_claim_attempts" CHECK ("attemptCount" >= 0 AND "maxAttempts" BETWEEN 1 AND 10),
        CONSTRAINT "CHK_shipment_claim_otp_expiry" CHECK (("otpDigest" IS NULL) = ("otpExpiresAt" IS NULL))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_shipment_claim_active_user"
      ON public.shipment_claim_challenge ("shipmentId", "claimantUserId")
      WHERE "consumedAt" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_shipment_claim_expiry"
      ON public.shipment_claim_challenge ("expiresAt")
      WHERE "consumedAt" IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS public.shipment_claim_challenge');
  }
}
