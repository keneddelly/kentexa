/**
 * SuperAgentHandlingEarningObligation — Stage 3S-C6 second correction:
 * transactional-outbox record for "this qualifying custody receipt OWES a
 * handling earning."
 *
 * The re-review's own finding: an ActivityEvent alone is not a durable
 * recovery mechanism, because ActivityEventService.record() deliberately
 * swallows its OWN write failures (never throws -- a logging failure must
 * never break the operation that triggered it). If the Activity table write
 * also failed, a bare "log on error" approach left NO durable trace that an
 * earning was ever owed at all.
 *
 * This table closes that gap with the standard transactional-outbox
 * pattern: `ParcelRunAssignmentService.confirmReceipt()` inserts one row
 * here, keyed by custodyEventId, in the SAME database transaction that
 * writes the qualifying `parcel_run_received` custody event and flips the
 * assignment to RECEIVED. Because it's the same transaction, the physical
 * receipt can only ever commit together WITH its own durable recovery
 * evidence -- there is no window where the receipt exists but nothing
 * durable says an earning is owed for it.
 *
 * Actually computing the earning (which needs a rate, and can fail for
 * ordinary reasons -- no rate configured yet, a transient error) then
 * happens as a SEPARATE, later step against this row, tracked by `status`.
 * This is deliberately a MUTABLE processing-state table -- unlike
 * SuperAgentHandlingEarning/SuperAgentCashCollection, it is NOT an
 * immutable financial ledger, so it carries no BEFORE UPDATE/DELETE
 * trigger. `resultingEarningId` points at the real, immutable earning row
 * once one exists; the earning itself remains the sole source of financial
 * truth.
 *
 * `parcelId`/`superAgentId` are plain columns with no relation, mirroring
 * this lineage's own established convention (see SuperAgentHandlingEarning's
 * own header comment) for the same reason -- no real CREATE TABLE migration
 * exists for either.
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Check,
} from 'typeorm';
import { ParcelCustodyEvent } from '../../super-agents/entities/parcel-custody-event.entity';
import { SuperAgentHandlingEarning } from './super-agent-handling-earning.entity';

export enum EarningObligationStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED_NO_RATE = 'failed_no_rate',
  FAILED_ERROR = 'failed_error',
  // Reached after MAX_ERROR_ATTEMPTS of a genuinely unexpected (not
  // "no rate configured yet") error -- excluded from automatic reclaim, so
  // it stops silently retrying and stays visible for a human to
  // investigate. FAILED_NO_RATE never escalates here: a missing rate is an
  // expected, self-healing configuration gap, not a fault. Requires an
  // explicit authorized replay (SuperAgentHandlingEarningObligationService.
  // forceReplay()), never an automatic one.
  FAILED_PERMANENT = 'failed_permanent',
  // Stage 3S-C6 third correction: the qualifying custody event carries no
  // provable physical-handoff identity, and a prior earning already exists
  // for the same (parcel, Super Agent) pair -- cross-writer equivalence
  // can't be proven automatically. NO earning was created. Excluded from
  // automatic reclaim; resolved only by an explicit human decision
  // (resolveAmbiguousHold()).
  HELD_AMBIGUOUS_IDENTITY = 'held_ambiguous_identity',
}

@Entity('super_agent_handling_earning_obligation')
@Index('UQ_super_agent_handling_earning_obligation_custody_event', ['custodyEventId'], { unique: true })
@Check(
  'CHK_super_agent_handling_earning_obligation_status_vocab',
  `status IN ('pending','processing','completed','failed_no_rate','failed_error','failed_permanent','held_ambiguous_identity')`,
)
export class SuperAgentHandlingEarningObligation {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => ParcelCustodyEvent, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'custodyEventId' })
  custodyEvent: ParcelCustodyEvent;

  @Column({ type: 'int' })
  custodyEventId: number;

  @Column({ type: 'int' })
  parcelId: number;

  @Column({ type: 'int' })
  superAgentId: number;

  @Column({ type: 'varchar', length: 24, default: EarningObligationStatus.PENDING })
  status: EarningObligationStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  lastError: string | null;

  @Column({ type: 'timestamp without time zone', nullable: true })
  lastAttemptedAt: Date | null;

  @ManyToOne(() => SuperAgentHandlingEarning, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'resultingEarningId' })
  resultingEarning: SuperAgentHandlingEarning | null;

  @Column({ type: 'int', nullable: true })
  resultingEarningId: number | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
