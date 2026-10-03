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
import { SuperAgent } from '../../super-agents/entities/super-agent.entity';

// I2G: a wallet has EXACTLY ONE owner (DB CHECK CK_wallet_exactly_one_owner):
//   Personal wallet:    userId NOT NULL,       workspaceId/superAgentId NULL  (UQ_wallet_personal)
//   Business wallet:    workspaceId NOT NULL,  userId/superAgentId NULL      (UQ_wallet_workspace)
//   Super Agent wallet: superAgentId NOT NULL, userId/workspaceId NULL      (UQ_wallet_super_agent)
// All three owner FKs are ON DELETE RESTRICT -- durable financial ownership
// never disappears through an owner deletion. Resolve only through
// WalletService.getOrCreatePersonalWallet / getOrCreateBusinessWallet /
// getOrCreateSuperAgentWallet.
//
// Stage 3S-C7 added the superAgentId owner type: a Super Agent's own
// operator User cannot safely stand in for it, because SuperAgent.userId is
// only unique when workspaceId IS NULL (UQ_super_agent_unbound_user) -- one
// user can legitimately operate multiple workspace-bound Super Agent hubs,
// and reusing their Personal wallet would silently merge those hubs'
// settlement money together.
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

  @ManyToOne(() => SuperAgent, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'superAgentId' })
  superAgent: SuperAgent | null;

  @Column({ type: 'int', nullable: true })
  superAgentId: number | null;

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
