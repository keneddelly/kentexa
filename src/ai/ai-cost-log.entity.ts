import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('ai_cost_log')
export class AiCostLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 40 })
  workflow: string;

  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @Column({ type: 'varchar', length: 60 })
  model: string;

  @Column({ type: 'int', default: 0 })
  inputTokens: number;

  @Column({ type: 'int', default: 0 })
  outputTokens: number;

  @Column({ type: 'int', default: 0 })
  cacheReadTokens: number;

  @CreateDateColumn()
  createdAt: Date;
}
