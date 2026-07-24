import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Order } from '../../orders/entities/order.entity';

export enum PayoutStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
}

@Entity()
export class Payout {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  seller: User;

  @ManyToOne(() => Order, { eager: true, onDelete: 'CASCADE' })
  order: Order;

  @Column('decimal', { precision: 10, scale: 2 })
  orderTotal: number;        // full order amount

  @Column('decimal', { precision: 10, scale: 2 })
  platformFeeAmount: number; // Kentexa kept this

  @Column('decimal', { precision: 10, scale: 2 })
  agentCommission: number;   // agent took this (0 if no agent)

  @Column('decimal', { precision: 10, scale: 2 })
  sellerAmount: number;      // seller receives this

  @Column({ type: 'enum', enum: PayoutStatus, default: PayoutStatus.PENDING })
  status: PayoutStatus;

  @Column({ type: 'text', nullable: true })
  paymentMethod: string | null;

  @Column({ type: 'text', nullable: true })
  transactionReference: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}