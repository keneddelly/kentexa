import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { SuperAgent } from './super-agent.entity';

@Entity('shipping_rate')
export class ShippingRate {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => SuperAgent, { onDelete: 'CASCADE' })
  superAgent: SuperAgent;

  @Column()
  originCity: string;

  @Column()
  destinationCity: string;

  // Rate per kg in TZS
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  ratePerKg: number;

  // Minimum charge regardless of weight
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  minimumCharge: number;

  // Estimated delivery days
  @Column({ type: 'int', default: 3 })
  estimatedDays: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
