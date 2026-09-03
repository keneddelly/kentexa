import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique, Index } from 'typeorm';

// The Phase A audit trail AND the idempotency guard in one row: the
// unique constraint below means a retried dispatch() for the same
// source event + recipient + channel finds the existing row and skips
// rather than sending a duplicate notification. recipientRole is part
// of the key (not just recipientUserId) because a self-purchase order
// (buyerId === sellerId, e.g. an admin test account) legitimately needs
// two distinct notifications — one as buyer, one as seller — for the
// same user; keying on userId alone collapsed those into one.
//
// Stage 2: recipientRole is free text -- never treated as an authorization
// principal, only as a legacy dedup/audit label. recipientAccountRoleId
// below is the real, server-resolved principal. A second partial unique
// index makes it part of the authoritative idempotency identity for any
// dispatch that resolved one, without touching the original constraint
// (which stays as-is for every dispatch that hasn't been updated to pass
// an accountRoleId yet).
@Entity('communication_log')
@Unique(['eventType', 'sourceType', 'sourceId', 'recipientUserId', 'recipientRole', 'channel'])
@Index('idx_communication_log_unique_scoped', ['eventType', 'sourceType', 'sourceId', 'recipientAccountRoleId', 'channel'], {
  unique: true,
  where: '"recipientAccountRoleId" IS NOT NULL',
})
export class CommunicationLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  eventType: string;

  @Column({ type: 'varchar' })
  sourceType: string;

  @Column({ type: 'int' })
  sourceId: number;

  @Column({ type: 'int' })
  recipientUserId: number;

  @Column({ type: 'varchar' })
  recipientRole: string;

  @Column({ type: 'varchar' })
  channel: string;

  @Column({ type: 'int', nullable: true })
  templateId: number | null;

  @Column({ type: 'varchar' })
  status: string; // 'sent' | 'failed' | 'skipped_no_template'

  @Column({ type: 'varchar', nullable: true })
  errorMessage: string | null;

  // ── Stage 2: audience attribution (additive, dual-write) ─────────────────
  @Column({ type: 'int', nullable: true })
  recipientAccountRoleId: number | null;

  @Column({ type: 'varchar', nullable: true })
  recipientWorkspaceType: string | null;

  @Column({ type: 'int', nullable: true })
  recipientWorkspaceId: number | null;

  @Column({ type: 'varchar', nullable: true })
  audienceScope: string | null;

  @Column({ type: 'varchar', nullable: true })
  transactionType: string | null;

  @Column({ type: 'int', nullable: true })
  transactionId: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
