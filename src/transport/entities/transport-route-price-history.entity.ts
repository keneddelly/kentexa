/**
 * TransportRoutePriceHistory — Stage 3S-B4: canonical, append-only price
 * versioning for TransportRoute.pricePerKg/fixedFee.
 * Place at: src/transport/entities/transport-route-price-history.entity.ts
 *
 * A provider price edit never overwrites a prior price in place -- it closes
 * the currently-open version (effectiveTo = the new version's effectiveFrom)
 * and opens a new one. At most one OPEN (effectiveTo IS NULL) row exists per
 * route at any time (DB-enforced partial unique index in the migration),
 * which is what makes "the currently effective price" a single deterministic
 * row: WHERE routeId = X AND effectiveFrom <= now() AND (effectiveTo IS NULL
 * OR effectiveTo > now()). Rows are read/audit data once superseded --
 * TransportService never deletes or rewrites a closed version.
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
