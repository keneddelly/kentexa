import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { DailyBatch } from './daily-batch.entity';
import { DeliveryZone } from './delivery-zone.entity';
import { Order } from '../../orders/entities/order.entity';

export enum BatchParcelStatus {
  AWAITING_HANDOVER = 'awaiting_handover', // seller hasn't dropped off yet
  AT_HUB             = 'at_hub',            // received at Kariakoo, waiting for van
  ON_VAN             = 'on_van',            // van has departed with this parcel
  AT_ZONE            = 'at_zone',           // arrived at destination zone agent
  OUT_FOR_DELIVERY   = 'out_for_delivery',  // zone agent doing last-mile
  DELIVERED          = 'delivered',
  RETURNED           = 'returned',          // couldn't deliver, returned to hub
}

/**
 * One parcel's journey within a DailyBatch — links an Order to a specific
 * batch run and tracks its zone-by-zone progress.
 */
@Entity()
export class BatchParcel {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => DailyBatch, batch => batch.parcels, { onDelete: 'CASCADE' })
  @JoinColumn()
  batch: DailyBatch;

  @ManyToOne(() => Order, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  order: Order;

  @ManyToOne(() => DeliveryZone, { eager: true })
  @JoinColumn()
  zone: DeliveryZone;

  @Column({ type: 'enum', enum: BatchParcelStatus, default: BatchParcelStatus.AWAITING_HANDOVER })
  status: BatchParcelStatus;

  @Column({ type: 'text', nullable: true })
  trackingNumber: string | null;

  @Column({ type: 'timestamp', nullable: true })
  handedOverAt: Date | null; // seller dropped off at Kariakoo hub

  @Column({ type: 'timestamp', nullable: true })
  arrivedAtZoneAt: Date | null; // van reached the zone

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}