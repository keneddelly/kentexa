import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export enum ParcelSizeClass {
  SMALL = 'small',
  STANDARD = 'standard',
  LARGE = 'large',
  SPECIAL = 'special',
}

@Entity('logistics_agent_pricing')
export class LogisticsAgentPricing {
  @PrimaryColumn({ type: 'enum', enum: ParcelSizeClass })
  sizeClass: ParcelSizeClass;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  pickupFee: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  deliveryFee: number | null;

  @Column({ type: 'boolean', default: false })
  requiresManualQuote: boolean;

  @UpdateDateColumn()
  updatedAt: Date;
}
