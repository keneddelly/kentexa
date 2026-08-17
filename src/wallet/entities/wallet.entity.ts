import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

// One Wallet per seller — the live, spendable balance. Payout (src/payouts/)
// stays the per-order historical/audit record; Wallet is the persisted
// running total sellers actually see and withdraw from, credited whenever
// escrow releases (see WalletService.creditFromEscrowRelease).
@Entity()
export class Wallet {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column({ type: 'int' })
  userId: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  balance: number; // withdrawable now

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  pendingBalance: number; // withdrawal requested, awaiting admin payout

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  totalEarned: number; // lifetime credits

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  totalWithdrawn: number; // lifetime paid-out withdrawals

  @Column({ default: 'TZS' })
  currency: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
