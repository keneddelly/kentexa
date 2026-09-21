import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Wallet } from './wallet.entity';

export enum WalletTransactionType {
  CREDIT_ESCROW_RELEASE = 'credit_escrow_release',
  WITHDRAWAL_REQUESTED = 'withdrawal_requested',
  WITHDRAWAL_PAID = 'withdrawal_paid',
  WITHDRAWAL_REJECTED = 'withdrawal_rejected',
  ADJUSTMENT = 'adjustment',
}

export enum WalletTransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  REJECTED = 'rejected',
}

// Append-only ledger — mirrors ReputationEvent's shape (running-total
// snapshot + immutable history) rather than mutating rows in place.
@Entity()
export class WalletTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Wallet, { onDelete: 'RESTRICT' })
  @JoinColumn()
  wallet: Wallet;

  @Column({ type: 'int' })
  walletId: number;

  @Column({ type: 'enum', enum: WalletTransactionType })
  type: WalletTransactionType;

  @Column('decimal', { precision: 12, scale: 2 })
  amount: number;

  @Column('decimal', { precision: 12, scale: 2 })
  balanceAfter: number;

  // Polymorphic pointer — e.g. { referenceType: 'order', referenceId: 42 }
  @Column({ type: 'varchar', nullable: true })
  referenceType: string | null;

  @Column({ type: 'int', nullable: true })
  referenceId: number | null;

  @Column({
    type: 'enum',
    enum: WalletTransactionStatus,
    default: WalletTransactionStatus.COMPLETED,
  })
  status: WalletTransactionStatus;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  // I2G: the routing entry this ledger row settles (UNIQUE -- at most one
  // ledger row per entry, so a credit can never be applied twice).
  @Column({ type: 'int', nullable: true })
  routingEntryId: number | null;

  // I2G: withdrawal destination used, plus an IMMUTABLE snapshot of it taken at
  // request time (Personal: copied from User.payout*; Business: copied from
  // the workspace PayoutDestination row). A later change can never redirect a
  // pending withdrawal.
  @Column({ type: 'int', nullable: true })
  payoutDestinationId: number | null;

  @Column({ type: 'jsonb', nullable: true })
  payoutSnapshot: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
