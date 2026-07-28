import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { BatchParcel } from './batch-parcel.entity';

export enum BatchStatus {
  OPEN = 'open', // accepting parcels, van hasn't departed
  CUTOFF = 'cutoff', // cutoff passed, no more parcels can join
  DEPARTED = 'departed', // van has left Kariakoo
  IN_PROGRESS = 'in_progress', // van is actively delivering to zones
  COMPLETED = 'completed', // all zones delivered
  CANCELLED = 'cancelled',
}

/**
 * One daily van run — represents the full route for a single day
 * (e.g. "Kariakoo → Mbagala → Bunju → Mbezi" on 2026-06-22).
 * All parcels for that day's batch link to this via BatchParcel.
 */
@Entity()
export class DailyBatch {
  @PrimaryGeneratedColumn()
  id: number;

  // The calendar date this batch runs — one batch per day
  @Column({ type: 'date' })
  runDate: Date;

  @Column({ type: 'enum', enum: BatchStatus, default: BatchStatus.OPEN })
  status: BatchStatus;

  // Cutoff time for sellers to hand off parcels (stored as full timestamp for that day)
  @Column({ type: 'timestamp' })
  cutoffTime: Date;

  // Planned departure time from Kariakoo hub
  @Column({ type: 'timestamp' })
  plannedDepartureTime: Date;

  @Column({ type: 'timestamp', nullable: true })
  actualDepartureTime: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  // Driver/vehicle info for this run
  @Column({ type: 'text', nullable: true })
  driverName: string | null;

  @Column({ type: 'text', nullable: true })
  driverPhone: string | null;

  @Column({ type: 'text', nullable: true })
  vehicleInfo: string | null; // e.g. "Bajaji - T123ABC"

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => BatchParcel, (bp) => bp.batch)
  parcels: BatchParcel[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
