/**
 * TransportAssignment — The accountability layer
 * Place at: src/transport/entities/transport-assignment.entity.ts
 *
 * When a Super Agent assigns a shipment to a provider, this record is created.
 * It tracks the full journey: assigned → accepted → collected → departed → arrived → completed
 * Creates complete audit trail — who, what, when, proof photos.
 */
import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { TransportProvider }   from './transport-provider.entity';
import { ProviderAvailability } from './provider-availability.entity';
import { User }                 from '../../users/entities/user.entity';

export enum AssignmentStatus {
  PENDING   = 'pending',    // assigned, waiting for provider to accept (manual confirm)
  ACCEPTED  = 'accepted',   // provider confirmed (or auto-confirmed)
  DECLINED  = 'declined',   // provider declined — super agent must reassign
  COLLECTED = 'collected',  // provider physically has the parcel
  DEPARTED  = 'departed',   // in transit
  ARRIVED   = 'arrived',    // at destination city
  COMPLETED = 'completed',  // handed to destination super agent or buyer
  CANCELLED = 'cancelled',  // cancelled by super agent
}

@Entity('transport_assignment')
export class TransportAssignment {
  @PrimaryGeneratedColumn()
  id: number;

  // What's being transported (order or parcel)
  @Column({ type: 'varchar', nullable: true })
  trackingNumber: string | null;

  @Column({ type: 'int', nullable: true })
  orderId: number | null;

  @Column({ type: 'int', nullable: true })
  parcelId: number | null;

  // Who assigned it
  @ManyToOne(() => User)
  @JoinColumn()
  assignedBy: User;

  @Column({ type: 'int' })
  assignedById: number;

  // Which provider
  @ManyToOne(() => TransportProvider)
  @JoinColumn()
  provider: TransportProvider;

  @Column({ type: 'int' })
  providerId: number;

  // Which availability slot (null = manual assignment without published slot)
  @ManyToOne(() => ProviderAvailability, { nullable: true })
  @JoinColumn()
  availability: ProviderAvailability;

  @Column({ type: 'int', nullable: true })
  availabilityId: number | null;

  // Route summary (denormalized for display)
  @Column({ type: 'varchar', nullable: true })
  fromCity: string | null;

  @Column({ type: 'varchar', nullable: true })
  toCity: string | null;

  // Status
  @Column({ type: 'enum', enum: AssignmentStatus, default: AssignmentStatus.PENDING })
  status: AssignmentStatus;

  // Parcel details
  @Column({ type: 'int', default: 1 })
  parcelCount: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  weightKg: number;

  // Price agreed (informational — payment outside KenteXa for manual)
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  agreedPrice: number | null;

  // Timeline with proof photos
  @Column({ type: 'timestamp', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  collectedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  collectionProofUrl: string | null;    // photo of parcel collected

  @Column({ type: 'timestamp', nullable: true })
  departedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  departureProofUrl: string | null;     // photo of ticket / vehicle

  @Column({ type: 'varchar', nullable: true })
  scheduledDeparture: string | null;    // "18:00 today"

  @Column({ type: 'timestamp', nullable: true })
  arrivedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  arrivalProofUrl: string | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  // Notes per stage
  @Column({ type: 'text', nullable: true })
  providerNotes: string | null;         // from provider (e.g. "Bus imechelewa")

  @Column({ type: 'text', nullable: true })
  superAgentNotes: string | null;

  @Column({ type: 'varchar', nullable: true })
  declineReason: string | null;         // if provider declined

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}