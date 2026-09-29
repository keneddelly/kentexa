/**
 * TransportQuoteService — Stage 3S-B3: the ONE canonical quote authority
 * sitting between discovery (Stage 3S-B2) and Shipment execution.
 *
 * createQuote() is a pure computation + persisted row: it reserves nothing,
 * creates no Parcel, and implies no carrier possession. acceptQuote() only
 * ever flips a status column under a row lock — same guarantee. The only
 * place capacity is ever reserved is Shipment creation
 * (ShipmentsService.createShipment), exactly as today, whether or not a
 * quote is involved.
 *
 * Deliberately provider-agnostic about its caller: nothing here assumes the
 * Shipment domain specifically, so a future Super Agent counter or Intent
 * caller can inject this same service later (Issue #61's own design
 * requirement) — neither is wired in during this gate.
 */
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { TransportQuote, TransportQuoteStatus } from './entities/transport-quote.entity';
import { TransportRoute } from './entities/transport-route.entity';
import { ProviderAvailability } from './entities/provider-availability.entity';
import { TransportService } from './transport.service';

// A quote is a short-lived commercial offer, not a long-hold reservation
// (nothing is reserved while it's merely OFFERED) — 15 minutes is enough for
// a customer to review Stage 3S-B2's comparison results and accept one.
export const QUOTE_VALIDITY_MS = 15 * 60_000;

export interface CreateQuoteDto {
  providerId: number;
  routeId: number;
  availabilityId?: number;
  originCity?: string;
  destinationCity?: string;
  weightKg?: number;
}

@Injectable()
export class TransportQuoteService {
  constructor(
    @InjectRepository(TransportQuote) private quoteRepo: Repository<TransportQuote>,
    @InjectRepository(TransportRoute) private routeRepo: Repository<TransportRoute>,
    @InjectRepository(ProviderAvailability) private availabilityRepo: Repository<ProviderAvailability>,
    private readonly transportService: TransportService,
    private readonly dataSource: DataSource,
  ) {}

  // The SAME formula TransportService.estimateShipmentPrice() already uses
  // (shipments.service.ts) -- kept identical, not re-derived, so this
  // gate's own parity requirement (#3: today's ordinary pricing must be
  // unchanged) holds by construction rather than by coincidence.
  private computeBaseAmount(route: TransportRoute, weightKg: number): number {
    const byWeight = Number(route.pricePerKg) * weightKg;
    return Math.max(byWeight, Number(route.fixedFee) || 0);
  }

  async createQuote(user: User, dto: CreateQuoteDto): Promise<TransportQuote> {
    const provider = await this.transportService.assertEligibleProvider(dto.providerId);

    const route = await this.routeRepo.findOne({ where: { id: dto.routeId } });
    if (!route) throw new NotFoundException('Route not found');
    if (route.providerId !== provider.id) {
      throw new BadRequestException("That route doesn't belong to the selected provider");
    }
    if (!route.isActive) throw new BadRequestException('That route is not currently active');

    let availability: ProviderAvailability | null = null;
    if (dto.availabilityId != null) {
      availability = await this.availabilityRepo.findOne({ where: { id: dto.availabilityId } });
      if (!availability) throw new NotFoundException('Availability slot not found');
      if (availability.providerId !== provider.id) {
        throw new BadRequestException("That availability slot doesn't belong to the selected provider");
      }
      if (availability.routeId != null && availability.routeId !== route.id) {
        throw new BadRequestException("That availability slot isn't for the selected route");
      }
    }

    if (dto.weightKg != null && (!Number.isFinite(dto.weightKg) || dto.weightKg < 0)) {
      throw new BadRequestException('weightKg must be a non-negative number');
    }
    const weightKg = dto.weightKg ?? 0;

    const baseAmount = this.computeBaseAmount(route, weightKg);
    const now = new Date();
    const quote = this.quoteRepo.create({
      requestedByUserId: user.id,
      providerId: provider.id,
      routeId: route.id,
      availabilityId: availability?.id ?? null,
      originCity: dto.originCity?.trim() || route.originCity || '',
      destinationCity: dto.destinationCity?.trim() || route.destinationCity || '',
      weightKg,
      baseAmount,
      // Stage 3S-B3 only ever populates `base` -- no platform/Agent/hub/
      // last-mile component exists yet (explicitly excluded from this gate).
      components: { base: baseAmount },
      totalAmount: baseAmount,
      currency: 'TZS',
      priceEffectiveAt: now,
      status: TransportQuoteStatus.OFFERED,
      expiresAt: new Date(now.getTime() + QUOTE_VALIDITY_MS),
      acceptedAt: null,
    });
    return this.quoteRepo.save(quote);
  }

  async getQuote(user: User, quoteId: number): Promise<TransportQuote> {
    const quote = await this.quoteRepo.findOne({ where: { id: quoteId } });
    if (!quote || quote.requestedByUserId !== user.id) throw new NotFoundException('Quote not found');
    return quote;
  }

  // Locked + idempotent, the same pattern this lineage already uses for
  // every other accept/confirm-style transition (Stage 3S-B1's
  // updateAssignmentStatus, Shipment's own confirmShipment claim): a retry
  // of an already-accepted quote returns the SAME frozen row untouched, and
  // an expired/foreign/already-terminal quote fails closed rather than
  // silently reactivating or re-pricing anything.
  async acceptQuote(user: User, quoteId: number): Promise<TransportQuote> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(TransportQuote);
      const quote = await repo.findOne({ where: { id: quoteId }, lock: { mode: 'pessimistic_write' } });
      if (!quote) throw new NotFoundException('Quote not found');
      if (quote.requestedByUserId !== user.id) {
        throw new ForbiddenException("Only the quote's requester can accept it");
      }
      if (quote.status === TransportQuoteStatus.ACCEPTED) return quote; // idempotent no-op
      if (quote.status !== TransportQuoteStatus.OFFERED || new Date(quote.expiresAt).getTime() <= Date.now()) {
        throw new ConflictException('This quote has expired or is no longer available');
      }
      quote.status = TransportQuoteStatus.ACCEPTED;
      quote.acceptedAt = new Date();
      return repo.save(quote);
    });
  }
}
