/**
 * ProviderAvailability — A specific trip published by a provider
 * Place at: src/transport/entities/provider-availability.entity.ts
 *
 * "ABC Bus is running Dar→Mbeya today at 18:00, 25 slots available"
 * Providers publish this daily. Super Agents see it when assigning transport.
 * Manual assignment also works without this (provider doesn't need to publish).
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

export enum AvailabilityStatus {
  OPEN = 'open', // accepting shipments
  FULL = 'full', // no more capacity
  DEPARTED = 'departed', // already left
  CANCELLED = 'cancelled', // trip cancelled
}

@Entity('provider_availability')
export class ProviderAvailability {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => TransportProvider, { onDelete: 'CASCADE' })
  @JoinColumn()
  provider: TransportProvider;

  @Column()
  providerId: number;

  @ManyToOne(() => TransportRoute, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn()
  route: TransportRoute;

  @Column({ nullable: true })
  routeId: number | null;

  // When
  @Column({ type: 'date' })
  date: string; // "2025-07-17"

  @Column({ type: 'varchar', nullable: true })
  departureTime: string | null; // "18:00"

  @Column({ type: 'varchar', nullable: true })
  arrivalEstimate: string | null; // "Next day 08:00"

  @Column({ type: 'varchar', nullable: true })
  bookingDeadline: string | null; // "17:30" — book before this time

  // Capacity
  @Column({ type: 'int', default: 0 })
  totalSlots: number;

  @Column({ type: 'int', default: 0 })
  usedSlots: number; // incremented as assignments are made

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  totalCapacityKg: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  usedCapacityKg: number;

  // Override route fields for this specific trip
  @Column({ type: 'varchar', nullable: true })
  fromCity: string | null; // can override route if doing partial trip

  @Column({ type: 'varchar', nullable: true })
  toCity: string | null;

  @Column({
    type: 'enum',
    enum: AvailabilityStatus,
    default: AvailabilityStatus.OPEN,
  })
  status: AvailabilityStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null; // "Bus imejaa upande wa pili" etc

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
