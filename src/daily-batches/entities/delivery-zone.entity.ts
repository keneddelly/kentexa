import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SuperAgent } from '../../super-agents/entities/super-agent.entity';

/**
 * A delivery zone within a city (e.g. Mbagala, Bunju, Mbezi within Dar es Salaam).
 * Each zone is served by one Super Agent who acts as the local micro-hub
 * for the daily van run — receiving the batch and handling last-mile delivery.
 */
@Entity()
export class DeliveryZone {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string; // e.g. "Bunju"

  @Column()
  city: string; // e.g. "Dar es Salaam"

  // Order in the van's route — determines manifest sequence and ETA calculation
  @Column({ type: 'int' })
  routeOrder: number;

  // Estimated arrival time offset from van departure, in minutes
  // e.g. Mbagala = 60min, Bunju = 90min, Mbezi = 120min after Kariakoo departure
  @Column({ type: 'int', default: 60 })
  etaMinutesFromDeparture: number;

  @ManyToOne(() => SuperAgent, {
    eager: true,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn()
  zoneAgent: SuperAgent | null;

  @Column({ default: true })
  isActive: boolean;

  // Keywords/areas that map to this zone for auto-detection from delivery address
  // e.g. ["Bunju", "Bunju A", "Bunju B", "Mbweni"]
  @Column({ type: 'simple-array', nullable: true })
  addressKeywords: string[] | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
