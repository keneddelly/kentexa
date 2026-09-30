/**
 * SuperAgentHandlingEarning — Stage 3S-C5: one immutable earning record per
 * qualifying ParcelCustodyEvent.
 * Place at: src/super-agent-commission/entities/super-agent-handling-earning.entity.ts
 *
 * The central invariant this table exists to enforce (Issue #62): "No
 * qualifying canonical ParcelCustodyEvent -> no Super Agent handling
 * earning." Every row here traces back to exactly one real, already-recorded
 * custody event -- this table never creates one of its own (see
 * SuperAgentHandlingEarningService, which only ever READS ParcelCustodyEvent,
 * never writes it).
 *
 * `custodyEventId` is a real @ManyToOne to ParcelCustodyEvent -- safe to
 * register here (unlike Parcel/TransportQuote/SuperAgent elsewhere in this
 * lineage) because Stage 3S-C4 already removed ParcelCustodyEvent's own
 * outgoing relation, making it a graph-free leaf entity. `parcelId`/
 * `superAgentId` remain plain columns with no relation, mirroring this
 * lineage's own established convention for Parcel/SuperAgent specifically
 * (no real CREATE TABLE migration exists for either, so no FK is declared).
 *
 * `amount`/`currency` are frozen at creation time from whichever
 * SuperAgentHandlingRate version was effective at the custody event's own
 * `recordedAt` instant -- never recomputed if the rate configuration changes
 * later. Immutable via the same BEFORE UPDATE/DELETE trigger technique
 * ParcelCustodyEvent already established; a future correction must be a new,
 * separate adjustment record layered on top, never an edit here.
 *
 * Stage 3S-C6 second correction: cross-pathway deduplication now keys on
 * `physicalHandoffRef`, not a custodian-type heuristic. An earlier version
 * of this constraint used (parcelId, superAgentId, sourceCustodianType) --
 * the re-review correctly rejected this as still a heuristic, not a proven
 * physical-handoff identity: it wrongly collapsed two REAL, distinct
 * receipts at the same hub from the SAME prior-custodian type (e.g. the
 * same carrier delivering a returned/re-shipped parcel in a later Run) into
 * one earning, while a conflict on it silently returned an EARLIER,
 * unrelated event's earning as though it belonged to the new one --
 * financially wrong either way.
 *
 * `physicalHandoffRef` is frozen from the qualifying custody event's own
 * `evidenceRef` -- the field this codebase already uses, across more than
 * one pathway, to name the concrete real-world operation a custody event
 * traces back to (parcel-collections.service.ts already writes
 * `collection:<collectionId>`; ParcelRunAssignmentService's own
 * confirmReceipt now writes `parcel_run_assignment:<assignmentId>` the same
 * way). Two custody events describing the SAME real physical handoff --
 * whichever pathway wrote them -- always carry the SAME concrete operation
 * reference, because it names the one real-world event both are reporting
 * on; two events describing genuinely DIFFERENT physical operations always
 * carry DIFFERENT references, because each concrete operation (a specific
 * Run assignment, a specific collection) has its own identity. This is
 * provable identity, not a category guess.
 *
 * `UQ_super_agent_handling_earning_physical_handoff` is a PARTIAL unique
 * index (`WHERE "physicalHandoffRef" IS NOT NULL`) on that column ALONE --
 * no parcelId/superAgentId scoping needed, since a single concrete
 * operation can only ever belong to one parcel and one Super Agent in the
 * first place. A qualifying event with no evidenceRef at all (still
 * possible for older/plainer pathways) is NOT constrained by this index --
 * cross-writer equivalence can't be proven for it, so it earns
 * independently rather than being silently guessed at (SuperAgentHandling-
 * EarningService flags that specific, genuinely ambiguous case for review
 * instead, via an ActivityEvent -- see its own header comment).
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ParcelCustodyEvent } from '../../super-agents/entities/parcel-custody-event.entity';
import { SuperAgentHandlingRate } from './super-agent-handling-rate.entity';

@Entity('super_agent_handling_earning')
@Index('UQ_super_agent_handling_earning_custody_event', ['custodyEventId'], { unique: true })
@Index('UQ_super_agent_handling_earning_physical_handoff', ['physicalHandoffRef'], {
  unique: true,
  where: '"physicalHandoffRef" IS NOT NULL',
})
export class SuperAgentHandlingEarning {
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

  // Frozen from the qualifying custody event's own `evidenceRef` -- the
  // proven physical-handoff identity, see this entity's own header comment.
  // Null when the qualifying event carries no concrete operation reference
  // at all (cross-writer dedup is then simply not attempted for that row).
  @Column({ type: 'varchar', length: 128, nullable: true })
  physicalHandoffRef: string | null;

  @ManyToOne(() => SuperAgentHandlingRate, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'rateConfigId' })
  rateConfig: SuperAgentHandlingRate;

  @Column({ type: 'int' })
  rateConfigId: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 8 })
  currency: string;

  // Which custody eventKind triggered this earning (e.g.
  // 'parcel_run_unloaded', 'origin_hub_received') -- audit/debugging only,
  // never re-derived from or compared against `custodyEvent.eventKind` at
  // read time.
  @Column({ type: 'varchar', length: 64 })
  source: string;

  // Null only for a system/automated trigger with no human actor behind it.
  @Column({ type: 'int', nullable: true })
  actorUserId: number | null;

  @CreateDateColumn() createdAt: Date;
}
