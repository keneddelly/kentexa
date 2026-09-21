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
import { OperationalWorkspace } from '../../business/entities/operational-workspace.entity';

// I2G: a wallet has EXACTLY ONE owner (DB CHECK CK_wallet_exactly_one_owner):
//   Personal wallet: userId NOT NULL, workspaceId NULL   (UQ_wallet_personal)
//   Business wallet: userId NULL,     workspaceId NOT NULL (UQ_wallet_workspace)
// Both owner FKs are ON DELETE RESTRICT -- durable financial ownership never
// disappears through a user/workspace deletion. Resolve only through
// WalletService.getOrCreatePersonalWallet / getOrCreateBusinessWallet.
@Entity()
export class Wallet {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @ManyToOne(() => OperationalWorkspace, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: OperationalWorkspace | null;

  @Column({ type: 'int', nullable: true })
  workspaceId: number | null;

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
