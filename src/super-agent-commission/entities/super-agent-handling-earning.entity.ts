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
