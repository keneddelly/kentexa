/**
 * TransportQuote — Stage 3S-B3: the ONE canonical, persisted commercial
 * selection layer between discovery (Stage 3S-B2) and Shipment execution.
 *
 * A quote is a frozen commercial fact, never a booking and never custody: it
 * reserves nothing, creates no Parcel, and implies no carrier possession
 * (see TransportQuoteService.createQuote/acceptQuote). It exists so an
 * already-accepted price survives a later TransportRoute price edit
 * unchanged — Shipment.createShipment() reads an ACCEPTED quote's own frozen
 * columns, never TransportRoute's current values, once a quote is in play.
 *
 * Component amounts are a jsonb map rather than fixed columns so future
 * gates (first-mile/hub/last-mile/platform fees) can be added without a
 * schema change to this table. Stage 3S-B5 formalized the component keys
 * (transport-quote-components.ts's TransportQuoteComponents) and made
 * totalAmount an explicit, reusable sum of whichever components are
 * present at creation time — as of this gate only `transportBase` ever
 * resolves to a real canonical value (see that file's own repository-first
 * assessment for why every other key stays absent rather than invented).
 * totalAmount is never recomputed afterward, whatever gets added later.
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TransportProvider } from './transport-provider.entity';
import type { TransportQuoteComponents } from '../transport-quote-components';
import { TransportRoute } from './transport-route.entity';
import { ProviderAvailability } from './provider-availability.entity';

export enum TransportQuoteStatus {
  OFFERED = 'offered', // created, not yet accepted; expires if unaccepted
  ACCEPTED = 'accepted', // customer committed; economics now frozen and immune to expiry
  EXPIRED = 'expired', // advisory only — acceptQuote() itself re-checks expiresAt independently
}

@Entity('transport_quote')
export class TransportQuote {
  @PrimaryGeneratedColumn()
  id: number;

  // Who asked for this price — the ordinary sender OR a seller/business
  // acting user, same "any authenticated user" convention as
  // Shipment.requestedByUserId. Never a marketplace Order requirement.
  @Column({ type: 'int' })
  requestedByUserId: number;

  @ManyToOne(() => TransportProvider, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'providerId' })
  provider: TransportProvider;

  @Column({ type: 'int' })
  providerId: number;

  @ManyToOne(() => TransportRoute, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'routeId' })
  route: TransportRoute;

  @Column({ type: 'int' })
  routeId: number;

  // Optional: a quote can price a route generically before a specific
  // departure is chosen (matching Shipment.availabilityId's own optionality).
  @ManyToOne(() => ProviderAvailability, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'availabilityId' })
  availability: ProviderAvailability | null;

  @Column({ type: 'int', nullable: true })
  availabilityId: number | null;

  // Snapshot, not a live lookup — origin/destination as they were AT QUOTE
  // TIME, independent of whatever the route's own fields say later.
  @Column({ type: 'varchar' })
  originCity: string;

  @Column({ type: 'varchar' })
  destinationCity: string;

  // The one parcel input this stage's pricing model uses.
  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  weightKg: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  baseAmount: number;

  // See TransportQuoteComponents (transport-quote-components.ts) for the
  // canonical key contract and which ones currently ever resolve.
  @Column({ type: 'jsonb', default: () => "'{}'" })
  components: TransportQuoteComponents;

  // Sum of `components` at creation time. Frozen forever after that —
  // nothing in this codebase ever recomputes or rewrites it.
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalAmount: number;

  @Column({ type: 'varchar', length: 8, default: 'TZS' })
  currency: string;

  // When the underlying TransportRoute price was read — the quote's own
  // "as of" fact, independent of any future price-history table.
  @Column({ type: 'timestamp' })
  priceEffectiveAt: Date;

  @Column({ type: 'enum', enum: TransportQuoteStatus, default: TransportQuoteStatus.OFFERED })
  status: TransportQuoteStatus;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  acceptedAt: Date | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
