/**
 * Vehicle — Stage 3S-C2: provider-scoped physical vehicle, without assuming
 * Kentexa ownership.
 * Place at: src/transport/entities/vehicle.entity.ts
 *
 * Per Issue #62 section E ("Vehicle administration"): "Support
 * provider-scoped vehicles without assuming Kentexa ownership." A Vehicle
 * belongs to exactly one TransportProvider and is a reusable resource that
 * can later be assigned to a TransportRun (TransportRun.vehicleId) -- this
 * gate wires that one assignment; it does not add driver/operator, capacity
 * reservation, or manifest logic (all explicitly excluded by C1 and not yet
 * authorized for C2 either).
 *
 * `type` reuses TransportProvider's own ProviderType enum rather than
 * inventing a second vehicle-type classification -- a provider registered
 * as VAN/BUS/TRUCK/etc. naturally operates vehicles of a compatible kind,
 * and this avoids a parallel taxonomy that could drift from the provider's
 * own type over time.
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Check,
} from 'typeorm';
import { TransportProvider, ProviderType } from './transport-provider.entity';

export enum VehicleOperationalStatus {
  AVAILABLE = 'available',
  IN_USE = 'in_use',
  MAINTENANCE = 'maintenance',
  RETIRED = 'retired',
}

@Entity('vehicle')
@Check('CHK_vehicle_capacity', '"parcelCapacity" IS NULL OR "parcelCapacity" >= 0')
@Check('CHK_vehicle_weight_capacity', '"weightCapacityKg" IS NULL OR "weightCapacityKg" >= 0')
@Check('CHK_vehicle_volume_capacity', '"volumeCapacityM3" IS NULL OR "volumeCapacityM3" >= 0')
export class Vehicle {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => TransportProvider, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'providerId' })
  provider: TransportProvider;

  @Column({ type: 'int' })
  providerId: number;

  // Provider's own internal name/code for this vehicle -- "Van #2", "Boda
  // KDA 221". Free text, always present, mirrors RouteStop.locationLabel's
  // own "always-present display string" convention.
  @Column({ type: 'varchar', length: 120 })
  identifier: string;

  // Nullable -- "where applicable" (e.g. some registered service modes may
  // not have a formal plate at onboarding time).
  @Column({ type: 'varchar', length: 40, nullable: true })
  registrationPlate: string | null;

  @Column({ type: 'enum', enum: ProviderType })
  type: ProviderType;

  @Column({ type: 'int', nullable: true })
  parcelCapacity: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  weightCapacityKg: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  volumeCapacityM3: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  maxCargoLengthCm: number | null;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  maxCargoWidthCm: number | null;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  maxCargoHeightCm: number | null;
  @Column({ type: 'simple-array', nullable: true })
  acceptedCargoClasses: string[] | null;
  @Column({ type: 'boolean', nullable: true })
  supportsLoadingAssistance: boolean | null;
  @Column({ type: 'boolean', nullable: true })
  supportsUnloadingAssistance: boolean | null;
  @Column({ type: 'boolean', nullable: true })
  supportsLiftingEquipment: boolean | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({
    type: 'enum',
    enum: VehicleOperationalStatus,
    enumName: 'vehicle_operational_status',
    default: VehicleOperationalStatus.AVAILABLE,
  })
  operationalStatus: VehicleOperationalStatus;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
