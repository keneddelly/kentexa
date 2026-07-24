import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, OneToMany, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { TzRegion } from './tz-region.entity';
import { TzWard } from './tz-ward.entity';

/**
 * TzDistrict — Tanzania Wilaya (Districts)
 * ~185 districts as of 2022
 */
@Entity('tz_district')
export class TzDistrict {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  name: string;                    // "Kinondoni"

  @Column({ type: 'varchar', nullable: true })
  nameSw: string | null;           // Swahili name if different

  @ManyToOne(() => TzRegion, r => r.districts)
  @JoinColumn({ name: 'region_id' })
  region: TzRegion;

  @Column({ name: 'region_id' })
  regionId: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lat: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lng: number | null;

  @Column({ type: 'boolean', default: true })
  isUrban: boolean;                // urban vs rural district

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => TzWard, w => w.district)
  wards: TzWard[];

  @CreateDateColumn()
  createdAt: Date;
}