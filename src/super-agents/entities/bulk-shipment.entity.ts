import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { SuperAgent } from './super-agent.entity';

export enum BulkShipmentStatus {
  OPEN = 'open', // Accepting more parcels
  SEALED = 'sealed', // No more parcels, ready to dispatch
  DISPATCHED = 'dispatched', // Sent out
  ARRIVED = 'arrived', // Reached destination
  COMPLETED = 'completed', // All parcels delivered
}

// How this consolidated shipment actually moves — determines which fields
// are meaningful. BUS_TRANSPORT needs transportCompany/transportRef;
// SUPER_AGENT_HANDOFF hands the whole box to another Super Agent for final
// delivery and never requires bus/ticket details at all.
export enum BulkShipmentDeliveryMethod {
  BUS_TRANSPORT = 'bus_transport',
  SUPER_AGENT_HANDOFF = 'super_agent_handoff',
}

@Entity('bulk_shipment')
export class BulkShipment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => SuperAgent, {
    eager: true,
    onDelete: 'SET NULL',
    nullable: true,
  })
  superAgent: SuperAgent | null;

  @Column()
  originCity: string;

  @Column()
  destinationCity: string;

  @Column({
    type: 'enum',
    enum: BulkShipmentStatus,
    default: BulkShipmentStatus.OPEN,
  })
  status: BulkShipmentStatus;

  @Column({ type: 'varchar', nullable: true })
  shipmentCode: string | null; // e.g. BULK-DAR-MZA-20260611-001

  @Column({ type: 'int', default: 0 })
  totalParcels: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  totalWeightKg: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalShippingCost: number;

  @Column({
    type: 'enum',
    enum: BulkShipmentDeliveryMethod,
    nullable: true,
  })
  deliveryMethod: BulkShipmentDeliveryMethod | null;

  @Column({ type: 'varchar', nullable: true })
  transportCompany: string | null; // Bus/truck company used

  @Column({ type: 'varchar', nullable: true })
  transportRef: string | null; // Bus ticket or waybill number

  // ── Last-mile Super Agent (deliveryMethod = SUPER_AGENT_HANDOFF) ────────
  // A REGISTERED, verified Kentexa Super Agent — set only when one was
  // actually selected from the real hub list, never for a manually typed
  // contact (see the plain contact fields below). Kept separate from that
  // so the frontend can never present an unverified name as if it were a
  // real Kentexa Super Agent.
  @ManyToOne(() => SuperAgent, {
    eager: true,
    onDelete: 'SET NULL',
    nullable: true,
  })
  lastMileSuperAgent: SuperAgent | null;

  // ── Manually entered last-mile contact — used only when no matching
  // registered Super Agent exists yet at the destination. Plain contact
  // fields, deliberately NOT a SuperAgent record — never treated as
  // verified anywhere this is displayed.
  @Column({ type: 'varchar', nullable: true })
  lastMileContactName: string | null;

  @Column({ type: 'varchar', nullable: true })
  lastMileContactPhone: string | null;

  @Column({ type: 'varchar', nullable: true })
  lastMileContactCity: string | null;

  // The findable office/location for a manual contact — a buyer told
  // "collect from X" with no address is stuck the same way a vague
  // registered-agent address is. Same idea as SuperAgent.address, just
  // typed directly since there's no account to read it from.
  @Column({ type: 'varchar', nullable: true })
  lastMileContactAddress: string | null;

  @Column({ type: 'timestamp', nullable: true })
  dispatchTime: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  arrivedTime: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // ── Dispatch cost & anti-fraud ──────────────────────────────────────────────
  @Column({ type: 'varchar', nullable: true })
  courierCostReceipt: string | null; // Photo of bus ticket / waybill covering the whole shipment

  // Sum of actualShippingFee across all parcels in this shipment (KenteXa's collected pool)
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalCollectedFee: number;

  // agentNet = totalCollectedFee - totalShippingCost
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  agentNet: number | null;

  @Column({ type: 'boolean', default: false })
  costFlagged: boolean;

  @Column({ type: 'text', nullable: true })
  costNote: string | null;

  @Column({ type: 'boolean', default: false })
  agentPaidOut: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
