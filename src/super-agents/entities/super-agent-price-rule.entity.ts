import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { SuperAgent } from './super-agent.entity';

/**
 * How one Super Agent office charges for transport (see src/super-agents/office-price.ts).
 * One row per office; no row = the default (10% of goods value, minimum 5,000 TZS).
 * By kg uses the office's existing per-destination rates (shipping_rate). Pickup and
 * delivery are not set here: in Dar they come from the boda boda fee. New records carry
 * a currency and a country (never hard-coded). Migration 1792200000000-AddOfficePriceRule.
 */
@Entity('super_agent_price_rule')
export class SuperAgentPriceRule {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => SuperAgent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'superAgentId' })
  superAgent: SuperAgent;

  @Column({ type: 'int', unique: true })
  superAgentId: number;

  @Column({ type: 'varchar', length: 10, default: 'value' })
  chargeMode: 'value' | 'kg';

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 10 })
  valuePercent: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 5000 })
  valueMinimum: number;

  @Column({ type: 'varchar', length: 3, default: 'TZS' })
  currency: string;

  @Column({ type: 'varchar', length: 2, default: 'TZ' })
  country: string;

  @Column({ type: 'int', nullable: true })
  updatedByUserId: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
