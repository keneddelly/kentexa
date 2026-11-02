import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Shehena hand-over code (owner approved 2026-11-02, sketch "Hand-over Codes").
 * One 6-digit code per dispatched shehena closes the two waybill steps that had none:
 *   office -> transport:   a transporter on KenteXa types it ("Nimepokea shehena");
 *   transport -> office:   the receiving office types it and every parcel arrives at once,
 *                          or receives without it by giving a reason (lost label).
 *
 *   bulk_shipment."handoverCode"               - the code (shown to the sending office,
 *                                                 in the receiving office's SMS)
 *   bulk_shipment."transportConfirmedAt"       - when the transporter confirmed
 *   bulk_shipment."codeAttempts"               - wrong codes typed (5 = no more tries)
 *   bulk_shipment."receivedWithoutCodeReason"  - the reason, when received without it
 *
 * Additive. Owner rule: never run down() on live.
 */
export class AddShehenaHandoverCode1794400000000 implements MigrationInterface {
  name = 'AddShehenaHandoverCode1794400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.bulk_shipment ADD COLUMN IF NOT EXISTS "handoverCode" varchar(6) NULL`);
    await q.query(`ALTER TABLE public.bulk_shipment ADD COLUMN IF NOT EXISTS "transportConfirmedAt" timestamptz NULL`);
    await q.query(`ALTER TABLE public.bulk_shipment ADD COLUMN IF NOT EXISTS "codeAttempts" integer NOT NULL DEFAULT 0`);
    await q.query(`ALTER TABLE public.bulk_shipment ADD COLUMN IF NOT EXISTS "receivedWithoutCodeReason" varchar(300) NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.bulk_shipment DROP COLUMN IF EXISTS "receivedWithoutCodeReason"`);
    await q.query(`ALTER TABLE public.bulk_shipment DROP COLUMN IF EXISTS "codeAttempts"`);
    await q.query(`ALTER TABLE public.bulk_shipment DROP COLUMN IF EXISTS "transportConfirmedAt"`);
    await q.query(`ALTER TABLE public.bulk_shipment DROP COLUMN IF EXISTS "handoverCode"`);
  }
}
