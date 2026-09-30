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
 * Stage 3S-C6: UQ_super_agent_handling_earning_parcel_agent_source, a SECOND
 * unique index on (parcelId, superAgentId, sourceCustodianType) -- the
 * cross-pathway deduplication safety net Stage 3S-C5's own report documented
 * as a plan, not yet built. The existing custodyEventId index protects
 * against reprocessing the SAME event twice; this one protects against two
 * DIFFERENT custody events (one from a legacy pathway, one from the new
 * Run-based pathway, say) that both happen to describe the SAME Super Agent
 * physically handling the SAME parcel FROM THE SAME PRIOR CUSTODIAN TYPE --
 * two recordings of one real physical handoff always share the same
 * `fromCustodianType`, since they're describing the same physical fact, so
 * this still catches every true cross-pathway duplicate.
 *
 * Stage 3S-C6 correction: an earlier version of this constraint was
 * (parcelId, superAgentId) alone, which wrongly blocked a Super Agent's
 * SECOND, genuinely separate handling operation on the same parcel -- e.g.
 * a local-loop origin hub receipt (fromCustodianType='local_agent') followed
 * later by a real destination receipt (fromCustodianType='transport_provider')
 * at the SAME hub. `sourceCustodianType` (frozen from the qualifying custody
 * event's own `fromCustodianType`, or 'unknown' when null) is the smallest
 * addition that distinguishes those two real operations from one physical
 * handoff recorded twice, without enumerating eventKind strings -- bound to
 * the same stable custodian-type vocabulary the eligibility rules already
 * use. Deliberately still conservative: one Super Agent can only ever earn
 * ONCE per (parcel, prior-custodian-type) triple -- a genuine repeat within
 * the SAME prior-custodian-type (e.g. two separate legacy-pathway "receive"
 * events, both from a transport provider, for a returned parcel) would still
 * only earn once, failing toward under- rather than over-payment.
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
@Index('UQ_super_agent_handling_earning_parcel_agent_source', ['parcelId', 'superAgentId', 'sourceCustodianType'], { unique: true })
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

  // Frozen from the qualifying custody event's own `fromCustodianType`
  // ('unknown' when null) -- see this entity's own header comment. Audit
  // AND dedup-key, never re-derived from custodyEvent at read time.
  @Column({ type: 'varchar', length: 32 })
  sourceCustodianType: string;

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
