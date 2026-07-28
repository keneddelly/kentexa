import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

/**
 * Intercity routing table — admin-managed city-to-city delivery matrix.
 *
 * Every pair of Tanzania cities that KenteXa services should have a row here.
 * The system uses this to:
 *   1. Show buyers an estimated delivery window at checkout
 *   2. Auto-assign origin and destination Super Agents by city match
 *   3. Generate "expected by" dates for parcel tracking
 *   4. Flag delayed parcels (arrived past estimatedDays)
 *
 * Bidirectional routes: Dar→Mwanza and Mwanza→Dar are separate rows since
 * travel time and cost may differ in each direction.
 */
@Entity('intercity_route')
@Unique(['originCity', 'destinationCity'])
export class IntercityRoute {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  originCity: string; // e.g. 'Dar es Salaam'

  @Column()
  destinationCity: string; // e.g. 'Mwanza'

  // ── Estimated delivery time ───────────────────────────────────────────────
  @Column({ type: 'int', default: 2 })
  estimatedDays: number; // working days, shown to buyer at checkout

  @Column({ type: 'int', nullable: true })
  estimatedHours: number | null; // optional — for same-day or short routes

  // ── Pricing ───────────────────────────────────────────────────────────────
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 5000 })
  baseShippingFee: number; // base fee for this route, per parcel

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1000 })
  perKgFee: number; // additional fee per kg above base weight (1kg)

  // ── Status ────────────────────────────────────────────────────────────────
  @Column({ default: true })
  isActive: boolean; // false = route suspended (no service currently)

  // ── Common transport method on this route ────────────────────────────────
  @Column({ type: 'varchar', nullable: true })
  primaryTransport: string | null; // 'bus' | 'courier' | 'agent_van' | 'flight'

  @Column({ type: 'text', nullable: true })
  notes: string | null; // e.g. "Via Morogoro — only Mon/Wed/Fri buses"

  // Transit hub — city where parcel must stop before reaching final destination
  // e.g. Dar→Mbinga has transitCity='Songea' meaning: Day1 Dar→Songea, Day2 Songea→Mbinga
  // null = direct route, no intermediate stop needed
  @Column({ type: 'varchar', nullable: true })
  transitCity: string | null;

  // Days for each leg when transit exists
  // e.g. Dar→Songea = 1 day, Songea→Mbinga = 1 day, total = 2
  @Column({ type: 'int', nullable: true })
  leg1Days: number | null; // origin → transitCity

  @Column({ type: 'int', nullable: true })
  leg2Days: number | null; // transitCity → destination

  // ── Region-based routing (for district price estimation) ─────────────────
  // When originRegion + destinationRegion are set, this route serves as the
  // BASE PRICE for all districts within those regions.
  // District surcharges are calculated automatically by TzPricingService.
  @Column({ type: 'varchar', nullable: true })
  originRegion: string | null; // e.g. 'Dar es Salaam'

  @Column({ type: 'varchar', nullable: true })
  destinationRegion: string | null; // e.g. 'Kilimanjaro'

  // ── Partner / Transport Provider ──────────────────────────────────────────
  // null = KenteXa estimate (manual, approximate)
  // set  = real price from integrated transport company
  @Column({ type: 'int', nullable: true })
  providerId: number | null; // FK to TransportProvider.id

  @Column({ type: 'varchar', nullable: true })
  providerName: string | null; // cached name e.g. "Scandinavian Express"

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  perKgFeePartner: number | null; // partner's real per-kg rate

  @Column({ type: 'boolean', default: false })
  isPartnerRoute: boolean; // true = real partner price, false = estimate

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 1.0 })
  districtMultiplierUrban: number; // surcharge for urban non-capital districts

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 1.1 })
  districtMultiplierRural: number; // surcharge for rural districts

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
