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
import { TransportQuoteComponents, sumQuoteComponents } from './transport-quote-components';
import { JourneyLeg, JourneySelection, JourneySelectionStatus } from './entities/journey-selection.entity';
import { JourneySelectionService } from './journey-selection.service';

// A quote is a short-lived commercial offer, not a long-hold reservation
// (nothing is reserved while it's merely OFFERED) — 15 minutes is enough for
// a customer to review Stage 3S-B2's comparison results and accept one.
export const QUOTE_VALIDITY_MS = 15 * 60_000;

export interface CreateQuoteDto {
  journeySelectionId?: number;
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
    @InjectRepository(JourneySelection) private journeyRepo: Repository<JourneySelection>,
    private readonly transportService: TransportService,
    private readonly dataSource: DataSource,
    private readonly journeys: JourneySelectionService,
  ) {}

  // The SAME formula TransportService.estimateShipmentPrice() already uses
  // (shipments.service.ts) -- kept identical, not re-derived, so this
  // gate's own parity requirement (#3: today's ordinary pricing must be
  // unchanged) holds by construction rather than by coincidence. Stage
  // 3S-B4: resolves the route's CURRENTLY EFFECTIVE price through the one
  // canonical resolver (TransportService.getEffectiveRoutePrice) rather than
  // reading route.pricePerKg/fixedFee directly, so a quote is priced off
  // whatever is actually in effect right now -- the quote row itself still
  // freezes the resulting baseAmount/totalAmount forever once created. Stage
  // 3S-B5: this is now explicitly the `transportBase` component among
  // several possible ones (see transport-quote-components.ts) rather than
  // the whole price by implication.
  private async computeTransportBase(route: TransportRoute, weightKg: number): Promise<number> {
    const { pricePerKg, fixedFee } = await this.transportService.getEffectiveRoutePrice(route.id);
    const byWeight = pricePerKg * weightKg;
    return Math.max(byWeight, fixedFee || 0);
  }

  async createQuote(user: User, dto: CreateQuoteDto): Promise<TransportQuote> {
    let journey: JourneySelection | null = null;
    // Gate 1: for a Journey-backed quote the origin/destination come from the
    // Journey leg the SERVER stored, never from the request. The send form
    // used to pass the place's display label here ("Kariakoo, Ilala, Dar es
    // Salaam"), which is not what the route was matched on.
    let journeyOriginCity: string | null = null;
    let journeyDestinationCity: string | null = null;
    if (dto.journeySelectionId != null) {
      journey = await this.journeyRepo.findOne({ where: { id: dto.journeySelectionId, requestedByUserId: user.id } });
      if (!journey || journey.status === JourneySelectionStatus.SUPERSEDED || journey.status === JourneySelectionStatus.CANCELLED) {
        throw new BadRequestException('Journey selection is not available for quoting');
      }
      const transportLegs = await this.dataSource.getRepository(JourneyLeg).find({ where: { journeySelectionId: journey.id } });
      const matchingLeg = transportLegs.find(l => l.providerId === dto.providerId && l.routeId === dto.routeId);
      if (!matchingLeg) {
        throw new BadRequestException('Quote provider/route must belong to the selected journey');
      }
      if (matchingLeg.availabilityId != null && dto.availabilityId !== matchingLeg.availabilityId) {
        throw new BadRequestException('Quote availability must match the selected journey leg');
      }
      if (dto.availabilityId != null && matchingLeg.availabilityId == null) {
        throw new BadRequestException('Quote cannot add an availability that was not selected by the journey');
      }
      const selectedWeight = Number(journey.cargoRequirements?.weightKg) || 0;
      if (dto.weightKg != null && Number(dto.weightKg) !== selectedWeight) {
        throw new BadRequestException('Quote weight must match the selected journey cargo');
      }
      const nodeCity = (node: unknown): string | null => {
        const value = (node as any)?.city ?? (node as any)?.label;
        return typeof value === 'string' && value.trim() ? value.trim() : null;
      };
      journeyOriginCity = nodeCity(matchingLeg.fromNode);
      journeyDestinationCity = nodeCity(matchingLeg.toNode);
    }

    const provider = await this.transportService.assertEligibleProvider(dto.providerId);

    const route = await this.routeRepo.findOne({ where: { id: dto.routeId } });
    if (!route) throw new NotFoundException('Route not found');
    if (route.providerId !== provider.id) {
      throw new BadRequestException("That route doesn't belong to the selected provider");
    }
    if (!route.isActive) throw new BadRequestException('That route is not currently active');

    if (dto.weightKg != null && (!Number.isFinite(dto.weightKg) || dto.weightKg < 0)) {
      throw new BadRequestException('weightKg must be a non-negative number');
    }
    // A Journey-backed quote that omits the weight is priced for the Journey's
    // own cargo, never for zero.
    const weightKg = dto.weightKg ?? (journey ? Number(journey.cargoRequirements?.weightKg) || 0 : 0);

    // Correction (post-B3 review): the client-supplied origin/destination
    // must actually correspond to the selected route -- reusing the
    // canonical discovery city-matching rule (assertRouteServesJourney),
    // not a second matcher, so a Dar->Mwanza route can never be frozen into
    // a quote labelled as if it were Dar->Arusha.
    const originCity = journeyOriginCity || dto.originCity?.trim() || route.originCity || '';
    const destinationCity = journeyDestinationCity || dto.destinationCity?.trim() || route.destinationCity || '';
    if (!originCity || !destinationCity) {
      throw new BadRequestException('Origin and destination are required to quote this route');
    }
    await this.transportService.assertRouteServesJourney(route.id, originCity, destinationCity);

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
      // Correction (post-B3 review): the direct quote API must not be able
      // to issue an OFFERED quote against an availability that discovery
      // itself would never have shown (FULL/CANCELLED/stale/unverified-
      // provider) -- reuses the exact same eligibility rule
      // findAvailableForRoute's publishedQuery applies, not a duplicate
      // policy. Shipment reservation still re-validates at execution time,
      // since eligibility can change again after the quote is issued.
      await this.transportService.assertAvailabilityIsDiscoverable(availability.id, weightKg);
    }

    const transportBase = await this.computeTransportBase(route, weightKg);
    // Stage 3S-B5: agentPickup/hubHandling/lastMileDelivery/platformService
    // stay absent -- no canonical, quote-domain-reachable authority exists
    // for any of them yet (full assessment in transport-quote-components.ts).
    // Never fabricated; a future gate that adds a real selection mechanism
    // (e.g. an agentId) populates them here without any schema change.
    const components: TransportQuoteComponents = { transportBase };
    const totalAmount = sumQuoteComponents(components);
    const now = new Date();
    const quote = this.quoteRepo.create({
      journeySelectionId: journey?.id ?? null,
      requestedByUserId: user.id,
      providerId: provider.id,
      routeId: route.id,
      availabilityId: availability?.id ?? null,
      originCity,
      destinationCity,
      weightKg,
      baseAmount: transportBase,
      components,
      totalAmount,
      currency: 'TZS',
      priceEffectiveAt: now,
      status: TransportQuoteStatus.OFFERED,
      expiresAt: new Date(now.getTime() + QUOTE_VALIDITY_MS),
      acceptedAt: null,
    });
    const saved = await this.quoteRepo.save(quote);
    if (journey) await this.journeys.markQuoted(user.id, journey.id);
    return saved;
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
      const saved = await repo.save(quote);
      if (quote.journeySelectionId != null) {
        await this.journeys.markCommitted(user.id, quote.journeySelectionId, manager);
      }
      return saved;
    });
  }
}
