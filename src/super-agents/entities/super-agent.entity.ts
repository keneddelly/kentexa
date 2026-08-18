import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum SuperAgentStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  BLOCKED = 'blocked',
}

// All Tanzania regions/cities
export const TANZANIA_CITIES = [
  'Dar es Salaam',
  'Mwanza',
  'Arusha',
  'Dodoma',
  'Mbeya',
  'Tanga',
  'Zanzibar',
  'Morogoro',
  'Kigoma',
  'Songea',
  'Tabora',
  'Shinyanga',
  'Iringa',
  'Lindi',
  'Mtwara',
  'Musoma',
  'Bukoba',
  'Sumbawanga',
  'Singida',
  'Babati',
  'Kibaha',
  'Kilosa',
  'Njombe',
  'Kasulu',
  'Mpanda',
  'Masasi',
  'Korogwe',
  'Moshi',
];

export const CITY_CODES: Record<string, string> = {
  'Dar es Salaam': 'DAR',
  Mwanza: 'MZA',
  Arusha: 'ARU',
  Dodoma: 'DOD',
  Mbeya: 'MBY',
  Tanga: 'TNG',
  Zanzibar: 'ZNZ',
  Morogoro: 'MRG',
  Kigoma: 'KGM',
  Songea: 'SNG',
  Tabora: 'TAB',
  Shinyanga: 'SHY',
  Iringa: 'IRN',
  Lindi: 'LND',
  Mtwara: 'MTW',
  Musoma: 'MSM',
  Bukoba: 'BKB',
  Sumbawanga: 'SMB',
  Singida: 'SGD',
  Babati: 'BBT',
  Kibaha: 'KBH',
  Kilosa: 'KLS',
  Njombe: 'NJB',
  Kasulu: 'KSL',
  Mpanda: 'MPD',
  Masasi: 'MSS',
  Korogwe: 'KRG',
  Moshi: 'MSH',
};

@Entity('super_agent')
export class SuperAgent {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  user: User;

  // ── Profile ───────────────────────────────────────────────────────────────
  @Column()
  businessName: string;

  @Column()
  city: string; // Operating city (hub location)

  @Column({ type: 'varchar', nullable: true })
  cityCode: string | null; // e.g. DAR, MZA

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  governmentId: string | null;

  @Column({ type: 'text', nullable: true })
  governmentIdImage: string | null;

  // ── Status ────────────────────────────────────────────────────────────────
  @Column({
    type: 'enum',
    enum: SuperAgentStatus,
    default: SuperAgentStatus.PENDING,
  })
  status: SuperAgentStatus;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;

  // ── Shipping rates (set by super agent per kg per city) ───────────────────
  // Stored as JSON: { "Mwanza": 3000, "Arusha": 4000, ... } per kg
  @Column({ type: 'jsonb', nullable: true, default: {} })
  shippingRates: Record<string, number>;

  // ── Earnings ──────────────────────────────────────────────────────────────
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalEarnings: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  pendingEarnings: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  withdrawableEarnings: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 10 })
  commissionRate: number; // % of shipping fee earned by super agent

  // ── Stats ─────────────────────────────────────────────────────────────────
  @Column({ type: 'int', default: 0 })
  totalParcelsHandled: number;

  @Column({ type: 'int', default: 0 })
  totalParcelsDelivered: number;

  @Column({ type: 'int', default: 0 })
  totalParcelsLost: number; // parcels that went missing under this agent

  @Column({ type: 'int', default: 0 })
  totalParcelsDelayed: number; // delivered but past estimated window

  @Column({ type: 'int', default: 0 })
  totalComplaints: number; // complaints raised against this agent

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 5.0 })
  rating: number; // 1.00 – 5.00, updated after each delivery

  @Column({ type: 'int', default: 0 })
  totalRatings: number; // how many ratings contributed to above

  // Cities this agent can RECEIVE from (origin coverage)
  // Stored as simple-array: ['Dar es Salaam', 'Kibaha', 'Bagamoyo']
  @Column({ type: 'simple-array', nullable: true })
  coverageCitiesOrigin: string[] | null;

  // Cities this agent can DELIVER to (destination coverage)
  @Column({ type: 'simple-array', nullable: true })
  coverageCitiesDestination: string[] | null;

  @Column({ type: 'varchar', nullable: true })
  agentCode: string | null; // Unique code e.g. SA-DAR-001

  // ── Founding-pilot free-order allowance (tracked only, no real billing yet) ──
  // freeOrdersGranted is 0 for every Super Agent by default; set via the
  // admin grant-free-orders endpoint for a specific pilot agent. Each
  // qualifying counter order increments freeOrdersUsed by exactly one
  // (computed once per created Parcel row, never on retry of an
  // already-succeeded request) until the grant is exhausted.
  @Column({ type: 'int', default: 0 })
  freeOrdersGranted: number;

  @Column({ type: 'int', default: 0 })
  freeOrdersUsed: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalPlatformFeesCharged: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalPlatformFeesWaived: number;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
