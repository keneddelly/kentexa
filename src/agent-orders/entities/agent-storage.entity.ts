import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Order } from '../../orders/entities/order.entity';
import { Agent } from '../../agents/entities/agent.entity';

export enum StorageStatus {
  STORED = 'stored',
  READY = 'ready',
  EXPIRED = 'expired',
  RETURNED = 'returned',
  COMPLETED = 'completed',
}

@Entity()
export class AgentStorage {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Order, { eager: true })
  order: Order;

  @ManyToOne(() => Agent, { eager: true })
  agent: Agent;

  @Column({ type: 'timestamp', nullable: true })
  receivedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  readyAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({ default: false })
  pickupReminderSent: boolean;

  @Column({ type: 'timestamp', nullable: true })
  returnedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  returnReason: string | null;

  @Column({ type: 'enum', enum: StorageStatus, default: StorageStatus.STORED })
  status: StorageStatus;

  @CreateDateColumn()
  createdAt: Date;
}
