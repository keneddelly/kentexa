/**
 * RouteStop — Stage 3S-C1: ordered, configurable stops belonging to a
 * reusable TransportRoute.
 * Place at: src/transport/entities/route-stop.entity.ts
 *
 * "Kariakoo → Mbagala → Ubungo → Mbezi → Bunju" as a real ordered sequence,
 * replacing what TransportRoute.transitCities/loopStops could only ever be:
 * unordered, free-text display strings with no loading/unloading/hub
 * semantics (see the Stage 3S-C repository audit, Issue #62).
 *
 * This is the REUSABLE, editable plan — a provider/admin may reorder,
 * add, deactivate or retag a stop here at any time. It is NOT the record of
 * what any already-scheduled TransportRun will actually execute; that is
 * TransportRunStop's job, snapshotted once at Run-creation time specifically
 * so editing a RouteStop here can never retroactively change a Run that
 * already copied it (the architecture decision behind this gate).
 *
 * Canonical location representation reuses the existing tz-location
 * authority (TzWard/TzRegion via TzLocationService), the same "best-effort,
 * never-blocking" resolution pattern TransportRoute.originRegionId /
 * destinationRegionId already use — not a second location system.
 * `locationLabel` is the source of truth for display (mirrors
 * TransportRoute.originCity/destinationCity's own free-text-first
 * convention); `wardId`/`regionId` are additive, nullable, best-effort links.
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Check,
} from 'typeorm';
import { TransportRoute } from './transport-route.entity';

// Post-C1-review correction: the CHECK is declared here too (not just in
// the migration's raw SQL), the same fix Stage 3S-B3 needed for
// shipment.quoteId's unique index -- synchronize:true test databases build
// schema purely from entity decorators, so the migration's
// CHK_route_stop_sequence constraint was otherwise invisible to every
// real-PostgreSQL test in this lineage.
//
// (routeId, sequence) uniqueness is deliberately NOT declared via @Index/
// @Unique here: it must be a DEFERRABLE constraint (see
// route-stop-schema.ts's ensureRouteStopDeferrableSequenceConstraint, called
// from the real migration and from any test needing it) so
// TransportRunService.reorderRouteStop() can swap two rows' sequence values
// within one transaction without a collision-prone temporary value.
// TypeORM's decorators have no way to express deferrability -- the same
// class of gap Stage 3S-B4's GiST exclusion constraint hit -- so declaring
// a plain @Index here would create a SECOND, non-deferrable constraint that
// defeats the whole point.
@Entity('route_stop')
@Check('CHK_route_stop_sequence', '"sequence" >= 0')
export class RouteStop {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => TransportRoute, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'routeId' })
  route: TransportRoute;

  @Column({ type: 'int' })
  routeId: number;

  // 0-based ordered position along the route. Unique per route (see index
  // above) -- the DB-level guarantee that two stops can never claim the
  // same slot in the sequence.
  @Column({ type: 'int' })
  sequence: number;

  @Column({ type: 'varchar', length: 200 })
  locationLabel: string; // "Mbagala"

  @Column({ type: 'int', nullable: true })
  wardId: number | null;

  @Column({ type: 'int', nullable: true })
  regionId: number | null;

  @Column({ type: 'boolean', default: true })
  loadingAllowed: boolean;

  @Column({ type: 'boolean', default: true })
  unloadingAllowed: boolean;

  @Column({ type: 'boolean', default: true })
  parcelAcceptanceAllowed: boolean;

  // Never true by default -- a route stop is NOT automatically a place a
  // customer can walk up and collect from (Issue #62's own stated rule: "A
  // route stop is not automatically a Super Agent hub").
  @Column({ type: 'boolean', default: false })
  customerCollectionAllowed: boolean;

  // Optional hub association. Nullable -- most stops are plain waypoints,
  // never forced to be a SuperAgent hub. No FK constraint is declared here
  // (kept consistent with how every other Stage 3S table already treats
  // super_agent/transport_route/transport_provider -- see this migration's
  // own doc comment for why).
  @Column({ type: 'int', nullable: true })
  superAgentId: number | null;

  @Column({ type: 'int', nullable: true })
  estimatedArrivalOffsetMinutes: number | null;

  @Column({ type: 'int', nullable: true })
  estimatedDepartureOffsetMinutes: number | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
