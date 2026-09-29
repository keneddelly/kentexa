/**
 * TransportRoutePriceHistory — Stage 3S-B4: canonical, append-only price
 * versioning for TransportRoute.pricePerKg/fixedFee.
 * Place at: src/transport/entities/transport-route-price-history.entity.ts
 *
 * A provider price edit never overwrites a prior price in place. Rows form a
 * timeline of non-overlapping [effectiveFrom, effectiveTo) windows for a
 * route -- the currently effective price is always the single deterministic
 * row matching WHERE routeId = X AND effectiveFrom <= now() AND (effectiveTo
 * IS NULL OR effectiveTo > now()). "effectiveTo IS NULL" means open-ended
 * into the future (no later version scheduled yet), NOT "the currently
 * active one" -- a route may have a currently-active CLOSED version (it ends
 * where an already-scheduled future version begins) plus that future OPEN
 * version beyond it. TransportService.setRoutePrice() supports inserting a
 * new version that SPLITS whichever existing window currently covers the
 * requested effective instant (an immediate correction splits the active
 * window without disturbing a later scheduled one; a reschedule at the same
 * instant as an existing version updates it in place). Non-overlap itself is
 * a cross-row invariant no @Check/@Unique/@Index decorator can express, so
 * it is enforced by a range-EXCLUDE constraint applied out-of-band by
 * route-price-history-schema.ts's ensureRoutePriceHistoryNoOverlapConstraint
 * (called from both the real migration and every real-Postgres test's
 * synchronize:true schema). Rows are read/audit data once superseded --
 * TransportService never deletes or rewrites an already-past window; only a
 * genuinely future, not-yet-effective version may be cancelled/merged back.
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TransportRoute } from './transport-route.entity';

@Entity('transport_route_price_history')
export class TransportRoutePriceHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => TransportRoute, { onDelete: 'CASCADE' })
  @JoinColumn()
  route: TransportRoute;

  @Column({ type: 'int' })
  routeId: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  pricePerKg: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  fixedFee: number;

  // When this version became (or will become) the effective price.
  @Column({ type: 'timestamp' })
  effectiveFrom: Date;

  // Null = the currently open, still-active version. Set to the superseding
  // version's effectiveFrom the moment that version is created -- a version
  // is closed and the next one opened in the SAME transaction, so there is
  // never a gap or an overlap between consecutive rows for one route.
  @Column({ type: 'timestamp', nullable: true })
  effectiveTo: Date | null;

  // Who made this price change; null only for the one auto-backfilled
  // "version zero" TransportService synthesizes the first time a
  // pre-Stage-3S-B4 route (one that predates this table) is ever price-edited.
  @Column({ type: 'int', nullable: true })
  changedByUserId: number | null;

  @CreateDateColumn() createdAt: Date;
}
