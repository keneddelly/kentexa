import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stage 3S schema only. No pickup writer, custody transition, historical
 * reconciliation, or production deployment is enabled by this migration.
 *
 * Renumbered from 1788282600000: that timestamp already belongs to the older
 * AddCheckoutRequestIdempotency migration (PRs #53/#54). This newer, still
 * empty, unreleased table sorts after it instead of disturbing that lineage.
 *
 * Stage 3S-A (physical first mile) extends THIS not-yet-shipped table with
 * additive columns only: the short-lived sender-to-Agent handoff proof
 * (same shape as the existing hub-to-Agent challenge on Parcel), the time the
 * Agent asked the hub to acknowledge, and the cancellation time. Nothing
 * here is backfilled and no existing table is altered.
 */
export class AddParcelPickupTask1788283200000 implements MigrationInterface {
  name = 'AddParcelPickupTask1788283200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS public.parcel_pickup_task (
      id SERIAL PRIMARY KEY,
      "parcelId" integer NOT NULL,
      "requestKey" uuid NOT NULL,
      "requestPayloadHash" character varying(64) NOT NULL,
      "requestedByUserId" integer NOT NULL,
      "servicePath" character varying(24) NOT NULL,
      "originSnapshot" jsonb NOT NULL,
      "pickupContactName" character varying(160) NOT NULL,
      "pickupContactPhone" character varying(32) NOT NULL,
      "quotedPickupFee" numeric(12,2),
      "originHubId" integer,
      "agentProfileId" integer,
      status character varying(24) NOT NULL DEFAULT 'requested',
      "claimedAt" timestamp without time zone,
      "collectedAt" timestamp without time zone,
      "handoverRequestedAt" timestamp without time zone,
      "completedAt" timestamp without time zone,
      "cancelledAt" timestamp without time zone,
      "handoffCodeHash" character varying(128),
      "handoffCodeIssuedAt" timestamp without time zone,
      "handoffCodeExpiresAt" timestamp without time zone,
      "handoffAttempts" integer NOT NULL DEFAULT 0,
      "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
      "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
      CONSTRAINT "FK_pickup_task_parcel" FOREIGN KEY ("parcelId")
        REFERENCES public.parcel(id) ON DELETE RESTRICT,
      CONSTRAINT "FK_pickup_task_origin_hub" FOREIGN KEY ("originHubId")
        REFERENCES public.super_agent(id) ON DELETE RESTRICT,
      CONSTRAINT "FK_pickup_task_agent" FOREIGN KEY ("agentProfileId")
        REFERENCES public.agent(id) ON DELETE RESTRICT,
      CONSTRAINT "CHK_pickup_task_service_path" CHECK (
        ("servicePath" = 'direct_delivery' AND "originHubId" IS NULL)
        OR ("servicePath" = 'hub_routed' AND "originHubId" IS NOT NULL)
      ),
      CONSTRAINT "CHK_pickup_task_origin" CHECK (
        jsonb_typeof("originSnapshot") = 'object'
        AND length(btrim("pickupContactName")) > 0
        AND length(btrim("pickupContactPhone")) > 0
        AND length("requestPayloadHash") = 64
      ),
      CONSTRAINT "CHK_pickup_task_handoff_code" CHECK (
        ("handoffCodeHash" IS NULL AND "handoffCodeIssuedAt" IS NULL AND "handoffCodeExpiresAt" IS NULL)
        OR ("handoffCodeHash" IS NOT NULL AND "handoffCodeIssuedAt" IS NOT NULL
            AND "handoffCodeExpiresAt" IS NOT NULL AND status = 'claimed')
      ),
      CONSTRAINT "CHK_pickup_task_attempts" CHECK ("handoffAttempts" >= 0),
      CONSTRAINT "CHK_pickup_task_fee" CHECK (
        "quotedPickupFee" IS NULL OR "quotedPickupFee" >= 0
      ),
      CONSTRAINT "CHK_pickup_task_status" CHECK (
        status IN ('requested','claimed','collected','awaiting_hub',
                   'hub_received','delivered','cancelled','expired')
        AND (status NOT IN ('claimed','collected','awaiting_hub','hub_received','delivered')
             OR "agentProfileId" IS NOT NULL)
        AND (status <> 'hub_received' OR "servicePath" = 'hub_routed')
        AND (status <> 'delivered' OR "servicePath" = 'direct_delivery')
        AND (status <> 'awaiting_hub' OR "servicePath" = 'hub_routed')
        AND (status <> 'requested' OR "agentProfileId" IS NULL)
      )
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pickup_task_request_key"
      ON public.parcel_pickup_task ("requestKey")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pickup_task_active_parcel"
      ON public.parcel_pickup_task ("parcelId")
      WHERE status IN ('requested','claimed','collected','awaiting_hub')`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pickup_task_agent_status"
      ON public.parcel_pickup_task ("agentProfileId", status)
      WHERE "agentProfileId" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pickup_task_origin_hub"
      ON public.parcel_pickup_task ("originHubId")
      WHERE "originHubId" IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('LOCK TABLE public.parcel_pickup_task IN ACCESS EXCLUSIVE MODE');
    const rows: { exists: boolean }[] = await queryRunner.query(
      'SELECT EXISTS (SELECT 1 FROM public.parcel_pickup_task) AS exists',
    );
    if (rows[0]?.exists) throw new Error('refusing to remove nonempty parcel pickup task history');
    await queryRunner.query('DROP TABLE public.parcel_pickup_task');
  }
}
