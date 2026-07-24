import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, OneToMany,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Order } from '../../orders/entities/order.entity';
import { SuperAgent } from './super-agent.entity';

export enum ParcelStatus {
  PENDING              = 'pending',              // Created, waiting for seller handover
  COLLECTION_REQUESTED = 'collection_requested', // Seller requested agent pickup
  COLLECTED_BY_AGENT   = 'collected_by_agent',   // Local agent has it, going to hub/bus
  RECEIVED_AT_HUB      = 'received_at_hub',      // Super agent received from seller/agent
  VERIFIED             = 'verified',             // Super agent verified contents
  READY_FOR_DISPATCH   = 'ready_for_dispatch',   // Packaged and ready
  DISPATCHED           = 'dispatched',           // Sent to destination city
  IN_TRANSIT           = 'in_transit',           // On the way
  TRANSFERRED_HUB      = 'transferred_hub',      // Moved from origin hub to transit hub
  ARRIVED_AT_HUB       = 'arrived_at_hub',       // Reached destination city hub/terminal
  AWAITING_BUYER       = 'awaiting_buyer',        // Arrived — waiting for buyer decision (pickup or delivery)
  OUT_FOR_DELIVERY     = 'out_for_delivery',     // Local agent delivering
  DELIVERED            = 'delivered',            // Buyer received
  SELF_PICKUP          = 'self_pickup',           // Buyer collected themselves from hub
  RETURNED             = 'returned',             // Returned to sender
  DISPUTED             = 'disputed',             // Issue raised
}

@Entity('parcel')
export class Parcel {
  @PrimaryGeneratedColumn()
  id: number;

  // ── Tracking ──────────────────────────────────────────────────────────────
  @Column({ type: 'varchar', unique: true, nullable: true })
  trackingNumber: string | null;  // e.g. KTX-DAR-MZA-000001

  @Column({ type: 'enum', enum: ParcelStatus, default: ParcelStatus.PENDING })
  status: ParcelStatus;

  // ── Linked order ──────────────────────────────────────────────────────────
  @ManyToOne(() => Order, { eager: true, nullable: true, onDelete: 'SET NULL' })
  order: Order | null;

  // ── People ────────────────────────────────────────────────────────────────
  @ManyToOne(() => User, { eager: false, nullable: true, onDelete: 'SET NULL' })
  seller: User | null;

  // For counter parcels (Agizo la Mkoa) — sender may not have a KenteXa account
  @Column({ type: 'varchar', nullable: true })
  senderName: string | null;

  @Column({ type: 'varchar', nullable: true })
  senderPhone: string | null;

  @ManyToOne(() => User, { eager: false, nullable: true, onDelete: 'SET NULL' })
  buyer: User | null;

  @ManyToOne(() => SuperAgent, { eager: false, nullable: true, onDelete: 'SET NULL' })
  superAgent: SuperAgent | null;          // Origin hub

  @ManyToOne(() => SuperAgent, { eager: false, nullable: true, onDelete: 'SET NULL' })
  destinationSuperAgent: SuperAgent | null; // Destination hub

  // ── Route ─────────────────────────────────────────────────────────────────
  @Column({ type: 'varchar' })
  originCity: string;

  @Column({ type: 'varchar' })
  destinationCity: string;

  // Transit city for multi-hop routes e.g. Songea when routing Dar→Mbinga
  // Null means direct route. When set the tracking page shows:
  // Dar es Salaam → Songea (transit) → Mbinga
  @Column({ type: 'varchar', nullable: true })
  transitCity: string | null;

  // Expected arrival date at final destination — calculated at creation from route table
  @Column({ type: 'date', nullable: true })
  expectedArrival: string | null;

  @Column({ type: 'varchar', nullable: true })
  deliveryAddress: string | null;

  @Column({ type: 'varchar', nullable: true })
  buyerPhone: string | null;

  @Column({ type: 'varchar', nullable: true })
  recipientName: string | null;

  // ── Local (last-mile) agent ─────────────────────────────────────────────────
  @Column({ type: 'varchar', nullable: true })
  localAgentId: string | null;     // User.id of the local agent doing last-mile delivery

  @Column({ type: 'varchar', nullable: true })
  localAgentName: string | null;

  @Column({ type: 'timestamp', nullable: true })
  claimedAt: Date | null;

  // ── Dispatch cost (single-parcel dispatch only — bulk uses BulkShipment) ────
  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  courierCost: number | null;       // What agent actually paid the bus/courier

  @Column({ type: 'varchar', nullable: true })
  courierCostReceipt: string | null; // Photo of bus ticket / courier receipt

  @Column({ type: 'varchar', nullable: true })
  transportRef: string | null;

  // agentNet = actualShippingFee - courierCost (this parcel's contribution to agent's float)
  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  agentNet: number | null;

  // Set if courierCost looks suspiciously high vs actualShippingFee
  @Column({ type: 'boolean', default: false })
  costFlagged: boolean;

  @Column({ type: 'text', nullable: true })
  costNote: string | null;

  @Column({ type: 'boolean', default: false })
  agentPaidOut: boolean; // admin has settled this parcel's net with the agent

  // ── Physical details ──────────────────────────────────────────────────────
  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  weightKg: number | null;

  @Column({ type: 'varchar', nullable: true })
  parcelSize: string | null;    // 'small' | 'medium' | 'large' | 'extra_large'

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // ── Financials ────────────────────────────────────────────────────────────
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  estimatedShippingFee: number;  // What seller estimated

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  actualShippingFee: number;     // What super agent calculated

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  shippingMargin: number;        // estimatedFee - actualFee = KenteXa profit

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  superAgentEarnings: number;    // Super agent's cut

  // ── Seller-initiated shipment fields ─────────────────────────────────────
  // When source = 'seller_shipment': seller created this, cash already collected
  // outside KenteXa. TZS 1,000 platform fee paid at creation.

  // The classified listing used as item description (draft — not publicly visible)
  @Column({ type: 'int', nullable: true })
  classifiedId: number | null;

  // Transport method seller chose
  @Column({ type: 'varchar', nullable: true })
  transportMethod: string | null;   // 'super_agent' | 'bus' | 'courier' | 'boda'

  // Bus/courier details — uploaded by seller or Super Agent
  @Column({ type: 'varchar', nullable: true })
  busCompany: string | null;

  @Column({ type: 'varchar', nullable: true })
  busTicketNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  busDeparture: string | null;    // e.g. "Jumanne 6am" — when bus departs

  @Column({ type: 'varchar', nullable: true })
  courierName: string | null;

  @Column({ type: 'varchar', nullable: true })
  courierTrackingRef: string | null;

  // Platform fee payment
  @Column({ type: 'boolean', default: false })
  platformFeePaid: boolean;         // TZS 1,000 paid → tracking activates

  // Buyer action at destination
  @Column({ type: 'boolean', nullable: true })
  buyerRequestedDelivery: boolean | null;  // null=not decided, true=wants delivery, false=self-pickup

  // Agreed last-mile delivery fee (set when buyer picks an agent)
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  agreedDeliveryFee: number | null;

  // Source of parcel
  @Column({ type: 'varchar', default: 'super_agent' })
  source: string;   // 'super_agent' | 'seller_shipment' | 'online_order'────────────────────────────────────────────────────
  @Column({ type: 'varchar', nullable: true })
  parcelPhoto: string | null;    // Photo taken by super agent at handover

  @Column({ type: 'varchar', nullable: true })
  deliveryPhoto: string | null;  // Photo taken at delivery

  // ── Handover ──────────────────────────────────────────────────────────────
  @Column({ type: 'timestamp', nullable: true })
  handoverTime: Date | null;     // When seller handed to super agent

  @Column({ type: 'timestamp', nullable: true })
  dispatchTime: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  arrivedAtHubTime: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  deliveredTime: Date | null;

  // ── Delivery confirmation ─────────────────────────────────────────────────
  @Column({ type: 'varchar', nullable: true })
  deliveryCode: string | null;   // SMS code buyer must confirm

  @Column({ type: 'boolean', default: false })
  buyerConfirmed: boolean;

  // ── Bulk shipment ─────────────────────────────────────────────────────────
  @Column({ type: 'int', nullable: true })
  bulkShipmentId: number | null; // If part of a bulk shipment

  // ── Notes ─────────────────────────────────────────────────────────────────
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'text', nullable: true })
  disputeReason: string | null;

  @OneToMany(() => ParcelTracking, t => t.parcel)
  trackingHistory: ParcelTracking[];

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

// ── Parcel Tracking History ───────────────────────────────────────────────────
@Entity('parcel_tracking')
export class ParcelTracking {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Parcel, p => p.trackingHistory, { onDelete: 'CASCADE' })
  parcel: Parcel;

  @Column({ type: 'enum', enum: ParcelStatus })
  status: ParcelStatus;

  @Column({ type: 'varchar', nullable: true })
  city: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  // Who handled this step — name, phone, location, type
  @Column({ type: 'varchar', nullable: true })
  updatedBy: string | null;        // handler name e.g. "Geita Express Hub" / "Juma Salehe"

  @Column({ type: 'varchar', nullable: true })
  handlerPhone: string | null;     // contact phone for this handler

  @Column({ type: 'varchar', nullable: true })
  handlerLocation: string | null;  // physical address / landmark of hub or agent

  @Column({ type: 'varchar', nullable: true })
  handlerType: string | null;      // 'super_agent' | 'local_agent' | 'system'

  @CreateDateColumn()
  createdAt: Date;
}