import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

// The Phase A audit trail AND the idempotency guard in one row: the
// unique constraint below means a retried dispatch() for the same
// source event + recipient + channel finds the existing row and skips
// rather than sending a duplicate notification.
@Entity('communication_log')
@Unique(['eventType', 'sourceType', 'sourceId', 'recipientUserId', 'channel'])
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

  @CreateDateColumn()
  createdAt: Date;
}
