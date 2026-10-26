import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Which transporter on KenteXa carried a shehena (owner 2026-10-26: KenteXa is the
 * one network that connects offices with the transport they use - their own
 * vehicles, partners', or hired). Until now the office typed the company name only,
 * so the transporter never saw the shehena it carried.
 *
 * One nullable column on bulk_shipment; existing rows stay NULL (typed name only).
 * Deploy-order safe: the code checks the column exists before using it (before this
 * migration the office can still type the name, as today). Owner rule: never run
 * down() on live.
 */
export class AddShehenaTransportProvider1793000000000 implements MigrationInterface {
  name = 'AddShehenaTransportProvider1793000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.bulk_shipment ADD COLUMN IF NOT EXISTS "transportProviderId" integer NULL`);
    await q.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_bulk_shipment_transport_provider') THEN
        ALTER TABLE public.bulk_shipment ADD CONSTRAINT "FK_bulk_shipment_transport_provider"
          FOREIGN KEY ("transportProviderId") REFERENCES public.transport_provider(id) ON DELETE SET NULL;
      END IF; END $$`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_bulk_shipment_transport_provider"
      ON public.bulk_shipment ("transportProviderId") WHERE "transportProviderId" IS NOT NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS public."IDX_bulk_shipment_transport_provider"`);
    await q.query(`ALTER TABLE public.bulk_shipment DROP CONSTRAINT IF EXISTS "FK_bulk_shipment_transport_provider"`);
    await q.query(`ALTER TABLE public.bulk_shipment DROP COLUMN IF EXISTS "transportProviderId"`);
  }
}
