/**
 * TransportRoute — The paths a provider covers
 * Place at: src/transport/entities/transport-route.entity.ts
 *
 * Bus: Dar → Mbeya (intercity)
 * Van: Kariakoo → Mbagala → Temeke (local loop)
 * Boda: Coverage wards (Bunju, Tegeta, Mbezi)
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

export enum RouteType {
  INTERCITY = 'intercity', // city to city (bus, courier, truck)
  LOCAL_LOOP = 'local_loop', // van doing a daily circuit within a city
  LAST_MILE = 'last_mile', // boda covering specific wards
}

@Entity('transport_route')
export class TransportRoute {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => TransportProvider, { onDelete: 'CASCADE' })
  @JoinColumn()
  provider: TransportProvider;

  @Column({ type: 'int' })
  providerId: number;

  @Column({ type: 'enum', enum: RouteType })
  routeType: RouteType;

  // Intercity fields
  @Column({ type: 'varchar', nullable: true })
  originCity: string | null; // "Dar es Salaam"

  @Column({ type: 'varchar', nullable: true })
  destinationCity: string | null; // "Mbeya"

  // Additive, best-effort links into the existing tz-location hierarchy —
  // resolved from originCity/destinationCity at write time when a match is
  // found. Nullable and never backfilled onto old rows; the plain city
  // strings above remain the source of truth for display either way.
  @Column({ type: 'int', nullable: true })
  originRegionId: number | null;

  @Column({ type: 'int', nullable: true })
  destinationRegionId: number | null;

  @Column({ type: 'simple-array', nullable: true })
  transitCities: string[] | null; // ["Morogoro", "Iringa"]

  // Local loop fields (van)
  @Column({ type: 'simple-array', nullable: true })
  loopStops: string[] | null; // ["Kariakoo", "Buguruni", "Mbagala", "Temeke"]

  // Last-mile fields (boda)
  @Column({ type: 'simple-array', nullable: true })
  coverageWards: string[] | null; // ["Bunju", "Tegeta", "Mbezi Luis"]

  @Column({ type: 'varchar', nullable: true })
  coverageCity: string | null; // "Dar es Salaam"

  // Pricing (informational — actual price agreed outside for manual)
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  pricePerKg: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  fixedFee: number; // minimum fee per parcel

  @Column({ type: 'int', nullable: true })
  estimatedHours: number | null; // journey time

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null; // "Hatusafirishi Jumapili"

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
