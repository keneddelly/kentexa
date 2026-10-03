/**
 * ParcelRunAssignment — Stage 3S-C3: binds one Parcel to one TransportRun
 * at a specific ordered load/unload leg.
 * Place at: src/transport/entities/parcel-run-assignment.entity.ts
 *
 * The central invariant this gate exists for (Issue #62): "A Run starts
 * wherever its scheduled route starts, but a parcel may enter and leave
 * that Run at any valid ordered pair of stops." Kariakoo -> Mbagala ->
 * Bunju can carry a Kariakoo->Bunju parcel, a Kariakoo->Mbagala parcel, AND
 * a Mbagala->Bunju parcel on the SAME Run -- nothing here ever treats the
 * Run's own origin as the parcel's origin.
 *
 * `loadRunStopId`/`unloadRunStopId` reference TransportRunStop -- the
 * IMMUTABLE per-Run snapshot C1 established -- NEVER the mutable, reusable
 * RouteStop. An assignment's load/unload points can never be changed out
 * from under it by a later Route edit, for exactly the same reason a Run's
 * own itinerary can't be.
 *
 * `parcelId` references the EXISTING, shared Parcel entity (super-agents
 * module) rather than inventing a parallel parcel concept -- "preserve the
 * shared parcel and custody architecture" (Issue #62's own instruction for
 * this gate). Deliberately a plain column, not a @ManyToOne relation --
 * mirrors Shipment.orderId's own convention for a cross-module reference,
 * so this entity never pulls Parcel's full relation graph (Order, Shipment,
 * User, SuperAgent, ...) into every consumer.
 *
 * Lifecycle: scheduled -> loaded -> unloaded -> received (when the unload
 * stop names a Super Agent -- confirmed independently by that Super Agent,
 * see Stage 3S-C6), or scheduled -> cancelled. Segment-capacity accounting
 * and manifest logic remain explicitly excluded.
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
import { TransportRun } from './transport-run.entity';
import { TransportRunStop } from './transport-run-stop.entity';

export enum ParcelRunAssignmentStatus {
  SCHEDULED = 'scheduled', // created, parcel not yet physically loaded
  LOADED = 'loaded', // physically on board, between load and unload stops
  // The transport PROVIDER's own claim the parcel came off the vehicle --
  // NOT yet confirmed by whichever Super Agent (if any) the unload stop
  // names. Terminal only when that stop has no Super Agent at all (an
  // ordinary waypoint); otherwise superseded by RECEIVED once confirmed.
  UNLOADED = 'unloaded',
  // Stage 3S-C6: the RECEIVING Super Agent's own, independently
  // authenticated confirmation of physical receipt -- a genuinely separate
  // real-world moment and actor from the provider's own UNLOADED claim.
  // Terminal. Only reachable from UNLOADED, and only when the unload stop
  // names a real Super Agent.
  RECEIVED = 'received',
  CANCELLED = 'cancelled', // terminal -- retracted before loading
}

@Entity('parcel_run_assignment')
// At most one ACTIVE (scheduled/loaded) assignment per parcel at a time --
// the DB-level backstop for "prevent conflicting active assignments for the
// same parcel" (Issue #62's own requirement), enforced the same way B3's
// UQ_shipment_quote already is: a partial unique index, real under both
// synchronize:true and the migration.
@Index('UQ_parcel_run_assignment_active', ['parcelId'], {
  unique: true,
  where: `status IN ('scheduled','loaded')`,
})
@Check('CHK_parcel_run_assignment_distinct_stops', '"loadRunStopId" <> "unloadRunStopId"')
export class ParcelRunAssignment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => TransportRun, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'runId' })
  run: TransportRun;

  @Column({ type: 'int' })
  runId: number;

  // Plain FK column, deliberately WITHOUT a @ManyToOne relation -- mirrors
  // Shipment.orderId's own established convention for referencing a
  // cross-module entity without pulling its full relation graph (Order,
  // Shipment, User, SuperAgent, ...) into every consumer of THIS entity.
  // The real FK constraint still lives in the migration.
  @Column({ type: 'int' })
  parcelId: number;

  // Both reference TransportRunStop -- the immutable snapshot, never
  // RouteStop -- and both are validated (service-layer) to belong to the
  // SAME run as `runId`, with loadRunStop.sequence < unloadRunStop.sequence.
  @ManyToOne(() => TransportRunStop, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'loadRunStopId' })
  loadRunStop: TransportRunStop;

  @Column({ type: 'int' })
  loadRunStopId: number;

  @ManyToOne(() => TransportRunStop, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unloadRunStopId' })
  unloadRunStop: TransportRunStop;

  @Column({ type: 'int' })
  unloadRunStopId: number;

  @Column({
    type: 'enum',
    enum: ParcelRunAssignmentStatus,
    enumName: 'parcel_run_assignment_status',
    default: ParcelRunAssignmentStatus.SCHEDULED,
  })
  status: ParcelRunAssignmentStatus;

  @Column({ type: 'timestamp', nullable: true })
  loadedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  unloadedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  receivedAt: Date | null;

  @Column({ type: 'int' })
  createdByUserId: number;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
