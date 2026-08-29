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

  // ── Referral program (Phase 4) ─────────────────────────────────────────
  // Generated once at approve() time, format KTX-SA-{id} — deliberately
  // distinct from agentCode (a shipping/business identifier already used
  // in labels) since this is a shareable invite code, a different concept.
  @Column({ type: 'varchar', unique: true, nullable: true })
  referralCode: string | null;

  // ── Standard new-Super-Agent free-order allowance ──
  // Every new Super Agent account starts with 50 free orders (the column
  // default below) — this is a standard onboarding benefit, not a one-off
  // grant to a single pilot account. The admin grant-free-orders endpoint
  // still exists to adjust an individual agent's allowance (e.g. extend it
  // as a reward, or correct it) but is no longer required just to get the
  // standard 50. Each qualifying counter order increments freeOrdersUsed by
  // exactly one (computed once per created Parcel row, never on retry of an
  // already-succeeded request) until the allowance is exhausted.
  @Column({ type: 'int', default: 50 })
  freeOrdersGranted: number;

  @Column({ type: 'int', default: 0 })
  freeOrdersUsed: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalPlatformFeesCharged: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalPlatformFeesWaived: number;

  // ── Real accumulating billing (post-free-allowance) ──
  // Count of orders that were actually charged a platform fee (i.e. past
  // freeOrdersGranted). platformFeePerOrder/billingThreshold are per-agent
  // and default to the platform-wide constants in super-agents.service.ts —
  // never hardcode a specific agent's id/name in billing logic; override
  // these columns per-row instead if an agent needs different terms.
  @Column({ type: 'int', default: 0 })
  paidOrders: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 1000 })
  platformFeePerOrder: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 10000 })
  billingThreshold: number;

  // Real money owed to Kentexa. Grows by platformFeePerOrder each time a
  // non-free order is created; zeroed when the Super Agent pays it down via
  // the billing-payment endpoint. When >= billingThreshold, new registration
  // endpoints (createOfflineIntercityOrder/createSellerShipment) must refuse
  // service until the balance is paid.
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  outstandingBalance: number;

  // Cash/mobile-money this agent is CURRENTLY PHYSICALLY HOLDING after
  // collecting a COD balance at delivery — Kentexa never touches this
  // money electronically (see updateParcelStatus()'s COD-collection
  // block), so it's a real liability the agent owes onward (to Kentexa,
  // which then pays the seller from its own Wallet ledger, same as every
  // other order type) until they remit it. Unlike outstandingBalance
  // (a flat per-order platform-subscription fee), this tracks the actual
  // TZS amount collected — incremented per COD delivery, decremented via
  // recordCodCashRemittance() when the agent pays it over.
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  codCashHeld: number;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
