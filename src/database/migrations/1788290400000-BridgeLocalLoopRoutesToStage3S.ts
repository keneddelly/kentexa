import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Production bridge for the existing Kentexa Dar local-loop Van route.
 *
 * The provider already has TransportRoute #3 with loopStops, while Stage 3S
 * executes only structured route_stop rows. This migration materializes the
 * existing route's ordered loopStops into the canonical Stage 3S stop plan.
 * It is data-driven (no route id assumption), idempotent, and does not create
 * DailyBatch/DeliveryZone state.
 */
export class BridgeLocalLoopRoutesToStage3S1788290400000 implements MigrationInterface {
  name = 'BridgeLocalLoopRoutesToStage3S1788290400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO public.route_stop
        ("routeId", sequence, "locationLabel", "wardId", "regionId",
         "loadingAllowed", "unloadingAllowed", "parcelAcceptanceAllowed",
         "customerCollectionAllowed", "superAgentId",
         "estimatedArrivalOffsetMinutes", "estimatedDepartureOffsetMinutes",
         "isActive", "createdAt", "updatedAt")
      SELECT r.id,
             s.ord - 1,
             btrim(s.label),
             NULL, NULL,
             true, true, true,
             false,
             CASE
               WHEN lower(btrim(s.label)) = 'kariakoo' THEN (
                 SELECT sa.id FROM public.super_agent sa
                 WHERE sa.status = 'active'
                   AND lower(coalesce(sa.address,'')) LIKE '%kariakoo%'
                 ORDER BY sa.id LIMIT 1
               )
               ELSE NULL
             END,
             CASE
               WHEN coalesce(r."estimatedHours",0) > 0
                 THEN round(((s.ord - 1)::numeric / GREATEST(array_length(r."loopStops",1)-1,1)) * r."estimatedHours" * 60)::int
               ELSE NULL
             END,
             NULL,
             true, now(), now()
        FROM public.transport_route r
        CROSS JOIN LATERAL unnest(r."loopStops") WITH ORDINALITY AS s(label, ord)
       WHERE r."routeType" = 'local_loop'
         AND r."isActive" = true
         AND r."loopStops" IS NOT NULL
         AND cardinality(r."loopStops") >= 2
         AND NOT EXISTS (
           SELECT 1 FROM public.route_stop rs WHERE rs."routeId" = r.id
         )
    `);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Conservative no-op: route stops may become live operations configuration.
  }
}
