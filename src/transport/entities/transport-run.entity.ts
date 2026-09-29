/**
 * TransportRun — Stage 3S-C1: an actual scheduled PHYSICAL execution of a
 * TransportRoute, distinct from ProviderAvailability.
 * Place at: src/transport/entities/transport-run.entity.ts
 *
 * Architecture decision (Issue #62): ProviderAvailability already
 * participates in Stage 3S-B1–B5's approved discovery/capacity/quote
 * behavior and points at a LIVE TransportRoute -- turning it into the
 * physical-execution/manifest/custody authority would mix two different
 * responsibilities and risk regressing that approved behavior. TransportRun
 * is therefore a new, separate concept: "the vehicle actually left Kariakoo
 * at 7am following this specific stop plan," not "a sellable capacity slot."
 * A future gate MAY let a ProviderAvailability reference a specific Run;
 * that bridge is explicitly not built in this gate.
 *
 * `routeId` records where this Run's stop plan came from (lineage/audit),
 * but is NEVER read again to determine what the Run actually does --
 * TransportRunStop (snapshotted once at creation) is the sole execution
 * authority for that. Editing the source TransportRoute after this Run
 * exists must never change this Run's own itinerary.
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TransportProvider } from './transport-provider.entity';
import { TransportRoute } from './transport-route.entity';

export enum TransportRunStatus {
  SCHEDULED = 'scheduled', // created, not yet open for anything downstream
  OPEN = 'open', // (future gate) open for booking/assignment
  CLOSED = 'closed', // (future gate) no longer accepting new assignments
  STARTED = 'started', // (future gate) physically underway
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

@Entity('transport_run')
export class TransportRun {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => TransportProvider, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'providerId' })
  provider: TransportProvider;

  @Column({ type: 'int' })
  providerId: number;

  // Lineage only -- see class doc comment. Never re-read to determine this
  // Run's own itinerary once TransportRunStop rows exist.
  @ManyToOne(() => TransportRoute, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'routeId' })
  route: TransportRoute;

  @Column({ type: 'int' })
  routeId: number;

  @Column({ type: 'timestamp' })
  scheduledDeparture: Date;

  @Column({
    type: 'enum',
    enum: TransportRunStatus,
    enumName: 'transport_run_status',
    default: TransportRunStatus.SCHEDULED,
  })
  status: TransportRunStatus;

  @Column({ type: 'int' })
  createdByUserId: number;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
