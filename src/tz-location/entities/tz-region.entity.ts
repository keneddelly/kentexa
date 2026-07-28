import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
} from 'typeorm';
import { TzDistrict } from './tz-district.entity';

/**
 * TzRegion — Tanzania Mikoa (Regions)
 * Source: NBS Tanzania 2022 Census + GADM
 * 31 regions as of 2022 (including Songwe, separated from Mbeya in 2016)
 */
@Entity('tz_region')
export class TzRegion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', unique: true })
  name: string; // "Dar es Salaam"

  @Column({ type: 'varchar', nullable: true })
  nameSw: string | null; // "Dar es Salaam" (same in Swahili)

  @Column({ type: 'varchar', nullable: true })
  capital: string | null; // "Dar es Salaam"

  @Column({ type: 'varchar', nullable: true })
  code: string | null; // "DSM", "ARU", "MWZ" etc

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lat: number | null; // centroid latitude

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lng: number | null; // centroid longitude

  @Column({ type: 'int', default: 0 })
  sortOrder: number; // display order (Dar first)

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => TzDistrict, (d) => d.region)
  districts: TzDistrict[];

  @CreateDateColumn()
  createdAt: Date;
}
