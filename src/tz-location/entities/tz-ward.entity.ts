import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { TzDistrict } from './tz-district.entity';
import { TzRegion } from './tz-region.entity';

/**
 * TzWard — Tanzania Kata (Wards)
 * ~3,900 wards nationally. Seeding Dar es Salaam first (~100 wards).
 * Others added progressively as agents register in those areas.
 */
@Entity('tz_ward')
export class TzWard {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  name: string; // "Kariakoo"

  @Column({ type: 'varchar', nullable: true })
  nameSw: string | null;

  @ManyToOne(() => TzDistrict, (d) => d.wards)
  @JoinColumn({ name: 'district_id' })
  district: TzDistrict;

  @Column({ name: 'district_id' })
  districtId: number;

  @Column({ name: 'region_id' })
  regionId: number;

  @ManyToOne(() => TzRegion)
  @JoinColumn({ name: 'region_id' })
  region: TzRegion;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lat: number | null; // centroid — good enough for proximity

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lng: number | null;

  @Column({ type: 'boolean', default: false })
  isUrban: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  // Population density hint — helps estimate delivery demand
  @Column({ type: 'varchar', nullable: true })
  densityClass: string | null; // 'high' | 'medium' | 'low' | 'rural'

  @CreateDateColumn()
  createdAt: Date;
}
