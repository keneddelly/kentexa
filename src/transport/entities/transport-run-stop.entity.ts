/**
 * TransportRunStop — Stage 3S-C1: the immutable, snapshotted ordered stop
 * plan a TransportRun actually executes.
 * Place at: src/transport/entities/transport-run-stop.entity.ts
 *
 * Copied once from the source TransportRoute's active RouteStops at Run
 * creation time (TransportRunService.createRun). After that copy, this row
 * is NEVER updated by anything in this codebase -- later reordering,
 * editing or deactivating the source RouteStop must have zero effect on an
 * already-created Run's itinerary (the whole point of this gate: Admin
 * changing "Kariakoo → Mbagala → Ubungo → Mbezi → Bunju" tomorrow must not
 * retroactively change what a Run scheduled today already committed to).
 *
 * `sourceRouteStopId` is traceability/audit only (nullable, ON DELETE
 * SET NULL) -- a RouteStop can be deleted or deactivated later without
 * corrupting or cascading into historical Run data, because every field
 * this Run actually needs to execute is already copied onto this row.
 *
 * IDs on this table are the stable, addressable identity a future
 * ParcelRunAssignment(loadRunStopId, unloadRunStopId) will reference --
 * e.g. a Parcel whose leg is Mbagala → Bunju addresses exactly those two
 * TransportRunStop rows, independent of the Run's own origin (Kariakoo).
 * Not implemented in this gate; the ID stability is.
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
import { TransportRun } from './transport-run.entity';
import { RouteStop } from './route-stop.entity';

@Entity('transport_run_stop')
@Index('UQ_transport_run_stop_sequence', ['runId', 'sequence'], { unique: true })
export class TransportRunStop {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => TransportRun, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'runId' })
  run: TransportRun;

  @Column({ type: 'int' })
  runId: number;

  // Traceability only -- see class doc comment. Nullable so deleting the
  // source RouteStop later can never be blocked by, or corrupt, history.
  @ManyToOne(() => RouteStop, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sourceRouteStopId' })
  sourceRouteStop: RouteStop | null;

  @Column({ type: 'int', nullable: true })
  sourceRouteStopId: number | null;

  @Column({ type: 'int' })
  sequence: number;

  // Everything below is a SNAPSHOT, copied once at Run creation -- never
  // re-read from RouteStop again.
  @Column({ type: 'varchar', length: 200 })
  locationLabel: string;

  @Column({ type: 'int', nullable: true })
  wardId: number | null;

  @Column({ type: 'int', nullable: true })
  regionId: number | null;

  @Column({ type: 'boolean' })
  loadingAllowed: boolean;

  @Column({ type: 'boolean' })
  unloadingAllowed: boolean;

  @Column({ type: 'boolean' })
  parcelAcceptanceAllowed: boolean;

  @Column({ type: 'boolean' })
  customerCollectionAllowed: boolean;

  @Column({ type: 'int', nullable: true })
  superAgentId: number | null;

  @Column({ type: 'int', nullable: true })
  estimatedArrivalOffsetMinutes: number | null;

  @Column({ type: 'int', nullable: true })
  estimatedDepartureOffsetMinutes: number | null;

  @CreateDateColumn() createdAt: Date;
}
