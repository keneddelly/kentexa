import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export type AiUsageStatus = 'success' | 'error' | 'fallback';

@Entity('ai_usage_log')
export class AiUsageLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 40 })
  task: string;

  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @Column({ type: 'varchar', length: 20 })
  provider: string;

  @Column({ type: 'varchar', length: 60 })
  model: string;

  @Column({ type: 'int', default: 0 })
  inputTokens: number;

  @Column({ type: 'int', default: 0 })
  outputTokens: number;

  @Column({ type: 'int', default: 0 })
  cacheReadTokens: number;

  @Column({ type: 'decimal', precision: 10, scale: 6, default: 0 })
  estimatedCost: number;

  @Column({ type: 'int', default: 0 })
  latencyMs: number;

  @Column({ type: 'varchar', length: 10, default: 'success' })
  status: AiUsageStatus;

  @CreateDateColumn()
  createdAt: Date;
}
