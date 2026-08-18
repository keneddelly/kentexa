import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

// Append-only — rows are never updated or deleted. This is the immutable
// "who did what when" record the codebase had nothing for: seller/service-
// provider verification changes, admin edits, order/payment status
// transitions, refund/dispute/settlement decisions, suspensions, product
// removals. Never write passwords, payment secrets, API keys, or full
// document/ID contents into previousValue/newValue — only the specific
// fields that changed.
@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  // Null for system-initiated actions (e.g. the auto-release cron), never
  // for anything a human triggered.
  @Index()
  @Column({ type: 'int', nullable: true })
  actorId: number | null;

  @Column({ type: 'varchar', nullable: true })
  actorRole: string | null;

  // Free-form, dot-namespaced: 'seller.approve', 'order.status_change',
  // 'user.suspend', 'dispute.resolve'. Not an enum — the set of actions
  // will grow as more call sites adopt this, and a giant enum would just
  // get out of sync with reality.
  @Column({ type: 'varchar' })
  action: string;

  @Index()
  @Column({ type: 'varchar' })
  entityType: string;

  @Index()
  @Column({ type: 'int' })
  entityId: number;

  @Column({ type: 'jsonb', nullable: true })
  previousValue: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  newValue: Record<string, any> | null;

  @Column({ type: 'varchar', nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', nullable: true })
  userAgent: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
