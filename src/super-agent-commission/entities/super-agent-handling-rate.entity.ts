/**
 * SuperAgentHandlingRate — Stage 3S-C5: effective-dated, versioned
 * configuration for the Super Agent physical-handling commission.
 * Place at: src/super-agent-commission/entities/super-agent-handling-rate.entity.ts
 *
 * Mirrors TransportRoutePriceHistory's own established shape (Stage 3S-B4)
 * for exactly the same reason: a rate change must never rewrite or delete a
 * prior version, so an already-recorded SuperAgentHandlingEarning's frozen
 * `amount`/`currency` can never be contradicted by a later admin edit.
 * Simpler than B4's own service, though -- there is no split-in-place
 * requirement here, only "reject an overlapping window" and "let a still-
 * future, not-yet-effective row be retracted" (`isActive`).
 *
 * `commissionType`/`scope` are free strings, not yet enum-constrained --
 * this pilot only ever populates ('handling', 'global'), but a future
 * commission type (e.g. a different physical operation) or a narrower scope
 * (e.g. per-region) can be added without a schema change, the same
 * "vocabulary grows without a migration" choice this lineage already made
 * for ParcelCustodyEvent.eventKind/custodianType.
 *
 * Non-overlap for (commissionType, scope) is a cross-row invariant no
 * @Check/@Unique/@Index decorator can express -- enforced by a partial
 * range-EXCLUDE constraint applied out-of-band by
 * super-agent-commission-schema.ts's
 * ensureSuperAgentHandlingRateNoOverlapConstraint (called from both the real
 * migration and every real-Postgres test's synchronize:true schema), scoped
 * to `isActive` rows only so a retracted draft frees its own time range for
 * a corrected replacement.
 */
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Check } from 'typeorm';

@Entity('super_agent_handling_rate')
// Post-review correction (Stage 3S-C5 re-review): declared here too, not
// just in the migration's raw SQL -- a migration-only CHECK is invisible to
// any synchronize:true test schema, this lineage's own repeatedly-hit gap
// (RouteStop.CHK_route_stop_sequence, ParcelCustodyEvent's assignment-type
// CHECKs). "A configured rate must be a real, positive amount" and "a
// window's close must come after its own open" are both plain, fully-
// validated constraints -- correct and sufficient for a freshly-built test
// schema, which has no legacy rows to grandfather.
@Check('CHK_super_agent_handling_rate_amount_positive', '"amount" > 0')
@Check('CHK_super_agent_handling_rate_window_valid', '"effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"')
export class SuperAgentHandlingRate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 32 })
  commissionType: string;

  @Column({ type: 'varchar', length: 32, default: 'global' })
  scope: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 8, default: 'TZS' })
  currency: string;

  @Column({ type: 'timestamp' })
  effectiveFrom: Date;

  // Null = open-ended into the future (no later version scheduled yet).
  @Column({ type: 'timestamp', nullable: true })
  effectiveTo: Date | null;

  // A genuine administrative retraction of a still-future, not-yet-effective
  // draft (mirrors Stage 3S-B4's cancelScheduledRoutePrice). Never used to
  // "undo" a version that has already been read by a real earning -- an
  // earning freezes its own amount/currency/rateConfigId at creation time,
  // completely independent of whatever this row later becomes.
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  // Null only for a migration-seeded initial configuration, where there is
  // no real acting user -- mirrors TransportRoutePriceHistory.changedByUserId's
  // own "version zero" convention.
  @Column({ type: 'int', nullable: true })
  createdByUserId: number | null;

  @CreateDateColumn() createdAt: Date;
}
