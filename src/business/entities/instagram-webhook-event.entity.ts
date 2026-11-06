import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Durable raw Meta webhook deliveries.
 *
 * Raw payloads are retained so message normalization/routing can be retried
 * without asking Meta to redeliver. Payload access must remain server-side.
 */
@Entity('instagram_webhook_event')
@Index('UQ_instagram_webhook_event_hash', ['eventHash'], { unique: true })
@Index('IDX_instagram_webhook_event_status_created', ['processingStatus', 'createdAt'])
export class InstagramWebhookEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64 })
  eventHash: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  objectType: string | null;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'varchar', length: 24, default: 'received' })
  processingStatus: 'received' | 'processing' | 'processed' | 'failed';

  @Column({ type: 'int', default: 0 })
  processingAttempts: number;

  @Column({ type: 'text', nullable: true })
  processingError: string | null;

  @Column({ type: 'timestamp', nullable: true })
  processingStartedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  processingStartedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  processedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
