import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Product } from '../../products/entities/products.entity';

export enum OrderStatus {
  PENDING_PAYMENT = 'pending_payment',
  PAID = 'paid',
  PREPARING = 'preparing',
  READY_PICKUP = 'ready_for_pickup',
  IN_TRANSIT = 'in_transit',
  DELIVERED = 'delivered',
  COMPLETED = 'completed',
  DISPUTED = 'disputed',
  CANCELLED = 'cancelled',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  RELEASED = 'released',
  REFUNDED = 'refunded',
  FAILED = 'failed',
}

export enum EscrowStatus {
  HOLDING = 'holding',
  RELEASED = 'released',
  REFUNDED = 'refunded',
  DISPUTED = 'disputed',
}

export enum PayoutStatus {
  PENDING = 'pending',
  RELEASED = 'released',
  PAID = 'paid',
  REFUNDED = 'refunded',
}

export enum DeliveryMethod {
  DIRECT = 'direct',
  AGENT = 'agent',
}

export enum OrderSource {
  ONLINE = 'online', // normal checkout via KenteXa
  OFFLINE = 'offline', // entered manually by seller/agent for a walk-in/cash sale
  OFFLINE_INTERCITY = 'offline_intercity', // Super Agent counter parcel — TZS 1,000 tracking fee applies
  SELLER_SHIPMENT = 'seller_shipment', // seller ships their own offline sale via KenteXa network
}

@Entity()
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  // ✅ Nullable — offline customers may not have a KenteXa account
  @ManyToOne(() => User, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  buyer: User | null;

  // ✅ Nullable — offline sales may not map to a catalog Product
  @ManyToOne(() => Product, {
    eager: true,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn()
  product: Product | null;

  @Column({ type: 'int' })
  quantity: number;

  // ── Offline order support ───────────────────────────────────────────────
  @Column({ type: 'enum', enum: OrderSource, default: OrderSource.ONLINE })
  source: OrderSource;

  // Free-text product description, used when product is null (offline sale)
  @Column({ type: 'text', nullable: true })
  manualProductName: string | null;

  // Buyer's name typed in by seller/agent, used when buyer is null
  @Column({ type: 'varchar', nullable: true })
  manualBuyerName: string | null;

  // Buyer's phone typed in by seller/agent, used when buyer is null
  @Column({ type: 'varchar', nullable: true })
  manualBuyerPhone: string | null;

  // Who created this offline order — seller's own User.id or the Super Agent's User.id
  @Column({ type: 'int', nullable: true })
  createdByUserId: number | null;

  // ── Amounts ──────────────────────────────────────────────────────────────
  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  baseAmount: number;

  @Column({ type: 'varchar', nullable: true })
  recipientName: string | null;

  // Super Agent's physically-checked shipping fee (may differ from seller's estimate)
  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  actualShippingFee: number | null;

  // Set when actual shipping fee was significantly higher than seller's estimate
  @Column({ type: 'boolean', default: false })
  shippingFeeFlagged: boolean;

  @Column({ type: 'text', nullable: true })
  shippingFeeNote: string | null;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  deliveryFeeAmount: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  totalAmount: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  platformFeeAmount: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 10 })
  platformFeePercent: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  agentCommissionAmount: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  sellerAmount: number;

  // ── Status ────────────────────────────────────────────────────────────────
  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING_PAYMENT,
  })
  status: OrderStatus;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  paymentStatus: PaymentStatus;

  @Column({ type: 'enum', enum: EscrowStatus, nullable: true })
  escrowStatus: EscrowStatus | null;

  @Column({ type: 'varchar', nullable: true, default: 'pending' })
  payoutStatus: string | null;

  // ── Delivery ──────────────────────────────────────────────────────────────
  @Column({ type: 'text', nullable: true })
  deliveryAddress: string | null;

  @Column({ type: 'text', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true, default: 'agent' })
  shippingMethod: string | null;

  @Column({ type: 'varchar', nullable: true })
  deliveryMethod: string | null;

  // ── Direct shipping proof ─────────────────────────────────────────────────
  @Column({ type: 'text', nullable: true })
  trackingNumber: string | null;

  // Set when this order was created from a paid classified invoice request
  // (classifieds.service.ts setShippingMethod()) — lets you trace back to
  // the originating ClassifiedInvoiceRequest row.
  @Column({ type: 'int', nullable: true })
  classifiedInvoiceId: number | null;

  // Set once the buyer has left a seller review for this order (from either
  // orders.service.ts rateSellerForOrder() or store.service.ts
  // submitReview()) — previously written via an `as any` cast with no
  // matching column on either side, so it silently never persisted at all.
  @Column({ type: 'boolean', default: false })
  sellerRated: boolean;

  @Column({ type: 'text', nullable: true })
  courierName: string | null;

  @Column({ type: 'varchar', nullable: true })
  busCompany: string | null;

  @Column({ type: 'varchar', nullable: true })
  busTicketNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  externalTrackingRef: string | null;

  // ── Manual order Super Agent shipping fee — collected as CASH at the moment
  // the Super Agent physically receives the parcel, never estimated upfront.
  // This is NOT part of totalAmount/sellerAmount — it's a separate cash
  // transaction between the seller and the Super Agent, recorded for the
  // agent's own earnings ledger. KenteXa never touches this money.
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  shippingFeeCollected: number | null;

  @Column({ type: 'int', nullable: true })
  shippingFeeCollectedByAgentId: number | null;

  @Column({ type: 'timestamp', nullable: true })
  shippingFeeCollectedAt: Date | null;

  // ── Seller collection request ─────────────────────────────────────────────
  // When the seller is in a rural area and can't bring the parcel to the hub
  // themselves, they request a local agent to collect it. The collection fee
  // is added to the buyer's total — seller is not penalised for location.
  @Column({ type: 'boolean', default: false })
  needsCollection: boolean; // true = seller requested agent pickup

  @Column({ type: 'text', nullable: true })
  sellerPickupAddress: string | null; // exact address for collection

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  collectionFee: number | null; // added to totalAmount when needsCollection=true

  @Column({ type: 'boolean', default: false })
  isRuralCollection: boolean; // flags rural rate (up to TZS 5,000)

  @Column({ type: 'text', nullable: true })
  shipmentProofUrl: string | null;

  @Column({ type: 'text', nullable: true })
  shippingReceiptImage: string | null;

  @Column({ type: 'text', nullable: true })
  shippingProductImage: string | null;

  @Column({ type: 'text', nullable: true })
  shippingNote: string | null;

  @Column({ type: 'timestamp', nullable: true })
  shippedAt: Date | null;

  // ── Agent tracking ────────────────────────────────────────────────────────
  @Column({ type: 'varchar', nullable: true })
  agentId: string | null;

  @Column({ type: 'text', nullable: true })
  agentNote: string | null;

  @Column({ type: 'timestamp', nullable: true })
  agentReceivedAt: Date | null;

  // ── Delivery confirmation ─────────────────────────────────────────────────
  @Column({ type: 'timestamp', nullable: true })
  deliveredAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  fundsReleasedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  autoConfirmAt: Date | null;

  // Auto-release deadline — set when order is marked delivered
  // Local orders: deliveredAt + 3 days
  // Intercity orders: deliveredAt + 5 days
  // Cron at 8am checks this and releases escrow if buyer hasn't confirmed
  @Column({ type: 'timestamp', nullable: true })
  autoReleaseAt: Date | null;

  // Offline tracking fee (TZS 1,000) — charged after parcel creation
  // null = not applicable (online order, fee collected through escrow)
  // false = fee owed but not yet paid (tracking locked)
  // true = fee paid, full tracking activated
  @Column({ type: 'boolean', nullable: true })
  platformFeePaid: boolean | null;

  // ── Dispute ───────────────────────────────────────────────────────────────
  @Column({ type: 'text', nullable: true })
  disputeReason: string | null;

  @Column({ type: 'text', nullable: true })
  disputeImage: string | null;

  @Column({ type: 'text', nullable: true })
  disputeResolution: string | null;

  @Column({ type: 'timestamp', nullable: true })
  disputedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  disputeOpenedAt: Date | null;

  // ── Invoice ───────────────────────────────────────────────────────────────
  @Column({ type: 'varchar', nullable: true })
  invoiceNumber: string | null;

  // ── Seller ───────────────────────────────────────────────────────────────
  @ManyToOne(() => User, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  seller: User | null;

  // Which specific CommerceProfile (personal vs a specific business) the
  // seller was operating as when this order was placed against their
  // product/listing — plain nullable id (not a relation), same additive
  // pattern as Product/Classified.commerceProfileId. Null on orders placed
  // before this column existed, or where the underlying product itself has
  // no commerceProfileId — those keep resolving to the seller's business
  // identity as before. An account running two separate businesses has no
  // other way to tell which one a given order belongs to.
  @Column({ type: 'int', nullable: true })
  commerceProfileId: number | null;

  // ── Buyer Confirmation Token (magic link — no login needed) ─────────────
  // Generated when seller marks order as DELIVERED
  // Sent to buyer via WhatsApp as a one-click confirmation link
  // Works for ALL order types: online, offline, manual, invoice, walk-in
  @Column({ type: 'varchar', nullable: true, unique: true })
  confirmationToken: string | null;

  @Column({ type: 'timestamp', nullable: true })
  confirmationTokenExpiry: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  buyerConfirmedAt: Date | null;

  @Column({ type: 'boolean', default: false })
  autoConfirmed: boolean; // true = confirmed by cron, not buyer

  // ── Review / Rating ───────────────────────────────────────────────────────
  @Column({ type: 'int', nullable: true })
  buyerRating: number | null; // 1-5 stars

  @Column({ type: 'text', nullable: true })
  buyerReview: string | null; // optional text review

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  // Super Agent (hub) and Transport Provider ratings — collected in the same
  // buyer-confirmation step as the seller rating, when a real Parcel/
  // TransportAssignment links this order to one of them.
  @Column({ type: 'int', nullable: true })
  superAgentRating: number | null; // 1-5 stars

  @Column({ type: 'text', nullable: true })
  superAgentReview: string | null;

  @Column({ type: 'int', nullable: true })
  transportRating: number | null; // 1-5 stars

  @Column({ type: 'text', nullable: true })
  transportReview: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
