import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum MoneyRoutingEventType {
  SELLER_PROCEEDS = 'SELLER_PROCEEDS',
  // Reserved: each future financial event gets its OWN immutable event key.
  REFUND = 'REFUND',
  PARTIAL_REFUND = 'PARTIAL_REFUND',
  ADJUSTMENT = 'ADJUSTMENT',
  REVERSAL = 'REVERSAL',
}

export enum MoneyRoutingState {
  PENDING = 'PENDING',
  ROUTED = 'ROUTED',
  BLOCKED = 'BLOCKED',
  CANCELLED = 'CANCELLED',
}

export enum MoneyRoutingTargetType {
  BUSINESS_WORKSPACE = 'BUSINESS_WORKSPACE',
  PERSONAL_USER = 'PERSONAL_USER',
  UNRESOLVED = 'UNRESOLVED',
}

/** Stable, machine-readable reasons a credit could not be routed. Never renamed. */
export enum MoneyRoutingBlockReason {
  ORDER_NOT_FOUND = 'ORDER_NOT_FOUND',
  WORKSPACE_MISSING = 'WORKSPACE_MISSING',
  PARENT_STAMPED_ORDER_UNSTAMPED = 'PARENT_STAMPED_ORDER_UNSTAMPED',
  AMBIGUOUS_LEGACY_OWNER = 'AMBIGUOUS_LEGACY_OWNER',
  SELLER_MISSING = 'SELLER_MISSING',
  AMOUNT_CONFLICT = 'AMOUNT_CONFLICT',
  RETRY_EXHAUSTED = 'RETRY_EXHAUSTED',
  WALLET_UNRESOLVABLE = 'WALLET_UNRESOLVABLE',
}

/**
 * Durable financial-routing entry: the idempotency record and transactional
 * outbox for money owed to a wallet. `eventKey` is the canonical, immutable
 * event identity (e.g. 'ORDER:42:SELLER_PROCEEDS'); it is deliberately NOT the
 * orderId, so an order can carry several distinct financial events over its
 * life (refund, partial refund, adjustment, reversal).
 */
@Entity('money_routing_entry')
export class MoneyRoutingEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', unique: true })
  eventKey: string;

  @Column({ type: 'varchar' })
  eventType: MoneyRoutingEventType;

  @Column({ type: 'int' })
  orderId: number;

  @Column('decimal', { precision: 12, scale: 2 })
  amount: string;

  @Column({ type: 'varchar' })
  targetType: MoneyRoutingTargetType;

  @Column({ type: 'int', nullable: true })
  targetWorkspaceId: number | null;

  @Column({ type: 'int', nullable: true })
  targetUserId: number | null;

  @Column({ type: 'varchar' })
  state: MoneyRoutingState;

  @Column({ type: 'varchar', nullable: true })
  blockReason: MoneyRoutingBlockReason | null;

  /** Identifiers needed for manual investigation; never used to change ownership. */
  @Column({ type: 'jsonb', nullable: true })
  blockDetail: Record<string, unknown> | null;

  /** Source observations (webhook / escrow release / COD / invoice-paid ...) that converged on this event. */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  observations: Array<{ source: string; at: string; ref?: string | null }>;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  nextAttemptAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'int', nullable: true })
  walletTransactionId: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  routedAt: Date | null;

  @Column({ type: 'int', nullable: true })
  resolvedByUserId: number | null;

  @Column({ type: 'text', nullable: true })
  resolutionNote: string | null;
}
