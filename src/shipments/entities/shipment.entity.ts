/**
 * Shipment — the demand side of transport: a user's request to move
 * something, independent of being a seller and independent of an Order.
 * Place at: src/shipments/entities/shipment.entity.ts
 *
 * "SHIPMENT REQUESTER ≠ SELLER" — a normal user sending clothes to a
 * relative, a business sending stock between branches, and a marketplace
 * order's delivery are all the same kind of record here; only `orderId`
 * differs (set when a sale triggered it, null for an independent request).
 *
 * Books against the EXISTING supply model (TransportRoute/
 * ProviderAvailability) — this entity does not duplicate route/schedule/
 * capacity, it just references them. Plain nullable int FKs throughout,
 * matching the established CommerceProfile-linkage convention (no eager
 * relations, zero import-time coupling between modules).
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ShipmentStatus {
  PENDING = 'pending', // requested, not yet matched to a provider/slot
  CONFIRMED = 'confirmed', // provider/slot assigned
  COLLECTED = 'collected', // picked up from sender
  IN_TRANSIT = 'in_transit',
  DELIVERED = 'delivered', // handed to receiver
  COMPLETED = 'completed', // fully closed out
  CANCELLED = 'cancelled',
}

export enum ShipmentHandoffOption {
  DOOR = 'door', // pickup/delivery at an address
  AGENT = 'agent', // via a Kentexa agent
  STATION = 'station', // collect/drop at the provider's own point
}

@Entity('shipment')
export class Shipment {
  @PrimaryGeneratedColumn()
  id: number;

  // Who's asking — never sellerId. Any authenticated user.
  @Column({ type: 'int' })
  requestedByUserId: number;

  // Defaults to the requester's own name/phone but editable — e.g.
  // sending on someone else's behalf.
  @Column({ type: 'varchar', nullable: true })
  senderName: string | null;

  @Column({ type: 'varchar', nullable: true })
  senderPhone: string | null;

  @Column({ type: 'varchar' })
  receiverName: string;

  @Column({ type: 'varchar' })
  receiverPhone: string;

  // Origin/destination — plain city strings kept for display and for
  // providers that only cover named cities; regionId is an additive,
  // best-effort resolution against the existing tz-location hierarchy
  // (nullable — never blocks a shipment if resolution fails/is ambiguous).
  @Column({ type: 'varchar' })
  originCity: string;

  @Column({ type: 'int', nullable: true })
  originRegionId: number | null;

  @Column({ type: 'varchar', nullable: true })
  originWard: string | null;

  @Column({ type: 'int', nullable: true })
  originWardId: number | null;

  @Column({ type: 'varchar' })
  destinationCity: string;

  @Column({ type: 'int', nullable: true })
  destinationRegionId: number | null;

  @Column({ type: 'varchar', nullable: true })
  destinationWard: string | null;

  @Column({ type: 'int', nullable: true })
  destinationWardId: number | null;

  @Column({ type: 'text' })
  itemDescription: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  weightKg: number;

  // What this books against — the EXISTING supply model. All nullable:
  // a shipment can be requested before a specific route/slot/provider is
  // chosen (matched later), same as TransportAssignment already allows
  // manual assignment without a published availability slot.
  @Column({ type: 'int', nullable: true })
  routeId: number | null;

  @Column({ type: 'int', nullable: true })
  availabilityId: number | null;

  @Column({ type: 'int', nullable: true })
  providerId: number | null;

  @Column({
    type: 'enum',
    enum: ShipmentHandoffOption,
    default: ShipmentHandoffOption.AGENT,
  })
  pickupOption: ShipmentHandoffOption;

  @Column({
    type: 'enum',
    enum: ShipmentHandoffOption,
    default: ShipmentHandoffOption.AGENT,
  })
  deliveryOption: ShipmentHandoffOption;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  priceQuoted: number | null;

  // Set only when a marketplace sale triggered this shipment — null for
  // every independent, user-initiated request. Not wired into the
  // checkout flow yet (deliberate — see plan's explicit deferrals); this
  // column exists so that retrofit is additive when it happens.
  @Column({ type: 'int', nullable: true })
  orderId: number | null;

  @Column({
    type: 'enum',
    enum: ShipmentStatus,
    default: ShipmentStatus.PENDING,
  })
  status: ShipmentStatus;

  @Column({ type: 'varchar', nullable: true, unique: true })
  trackingNumber: string | null;

  @Column({ type: 'timestamp', nullable: true })
  collectedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
