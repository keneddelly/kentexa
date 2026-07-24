import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Agent } from './agent.entity';
import { Invoice } from '../../invoices/entities/invoice.entity';

export enum AgentTransactionStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  REVERSED = 'reversed',
}

@Entity('agent_transaction')
export class AgentTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Agent, { eager: true, onDelete: 'CASCADE' })
  agent: Agent;

  @ManyToOne(() => Invoice, { eager: true, onDelete: 'CASCADE' })
  invoice: Invoice;

  @Column('decimal', { precision: 10, scale: 2 })
  invoiceAmount: number;

  @Column('decimal', { precision: 5, scale: 2 })
  commissionRate: number;

  @Column('decimal', { precision: 10, scale: 2 })
  commissionAmount: number;

  @Column({ type: 'text', nullable: true })
  transactionReference: string | null;

  @Column({ type: 'text', nullable: true })
  paymentMethod: string | null;

  @Column({ type: 'enum', enum: AgentTransactionStatus, default: AgentTransactionStatus.PENDING })
  status: AgentTransactionStatus;

  @CreateDateColumn()
  createdAt: Date;
}