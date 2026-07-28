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

  @Column({ type: 'varchar', nullable: true })
  transportCompany: string | null; // Bus/truck company used

  @Column({ type: 'varchar', nullable: true })
  transportRef: string | null; // Bus ticket or waybill number

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
