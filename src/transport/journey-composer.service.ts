import { BadRequestException, Injectable } from '@nestjs/common';
import { CargoRequirements, normalizeCargoRequirements } from './journey/cargo-requirements';
import { JourneyLegType } from './entities/journey-selection.entity';
import { JourneySelectionService } from './journey-selection.service';
import { TransportService, DiscoverySortBy } from './transport.service';
import { LocationIntelligenceService } from '../location-intelligence/location-intelligence.service';
import {
  MAX_KEY_PAIRS,
  buildLogisticsLocationContext,
  buildTextLogisticsContext,
} from '../shipments/logistics-location-context';
import { DISCOVERY_CITY_MAX, DISCOVERY_CITY_MIN } from './city-match';

/**
 * One side of a journey as the CLIENT may state it: a reference to a place it
 * selected from GET /location-intelligence/places, or text it typed. Nothing
 * else. Names, hierarchy, routing keys and the stored snapshot are derived by
 * the server from its own data (Gate 1) -- the same rule Shipment creation
 * has followed since Stage 2D.
 */
export interface JourneySideInput {
  place?: { providerKey: string; providerPlaceId: string } | null;
  text?: string | null;
}

export interface ComposeJourneyDto {
  // Gate 1 contract: the client names each side; the server resolves it.
  origin?: JourneySideInput;
  destination?: JourneySideInput;
  // Pre-Gate-1 contract, kept only for callers that already hold a
  // server-authored snapshot ({ city | label }). Ignored for a side whose
  // `origin` / `destination` input above is present.
  originSnapshot?: Record<string, unknown>;
  destinationSnapshot?: Record<string, unknown>;
  cargoRequirements: CargoRequirements;
  paymentMethod?: 'cash' | 'prepaid';
  sortBy?: DiscoverySortBy;
  // A customer who came from a transporter's profile has already chosen the
  // provider: only that provider's options are composed.
  providerId?: number;
}

export interface SelectComposedJourneyDto extends ComposeJourneyDto {
  availabilityId: number;
}

/** A side after the server has resolved it. `keys` are routing keys, most specific first. */
interface ResolvedJourneySide {
  snapshot: Record<string, unknown>;
  keys: string[];
}

@Injectable()
export class JourneyComposerService {
  constructor(
    private readonly transport: TransportService,
    private readonly selections: JourneySelectionService,
    // Deliberately NOT @Optional(): if TransportModule ever stops importing
    // LocationIntelligenceModule the app must fail at start-up (which the CI
    // boot check catches), not quietly answer 400 to every selected place.
    // The TypeScript `?` only lets hand-built test doubles omit it.
    private readonly locations?: LocationIntelligenceService,
  ) {}

  private legacyNodeLabel(snapshot: Record<string, unknown> | undefined, side: string): string {
    const value = snapshot?.city ?? snapshot?.label ?? snapshot?.locality ?? snapshot?.name;
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) throw new BadRequestException(`${side} must contain a server-resolvable city or label`);
    return text;
  }

  /**
   * Turns what the client said about one side into a server-authored
   * snapshot plus its routing keys. A selected place is re-resolved exactly
   * (never searched by name); typed text is used as typed and labelled
   * unresolved. A malformed or unknown reference is a 400.
   */
  private async resolveSide(
    side: 'Origin' | 'Destination',
    input: JourneySideInput | undefined,
    legacySnapshot: Record<string, unknown> | undefined,
  ): Promise<ResolvedJourneySide> {
    const place = input?.place;
    if (place !== undefined && place !== null) {
      if (
        typeof place !== 'object' ||
        typeof place.providerKey !== 'string' ||
        typeof place.providerPlaceId !== 'string'
      ) {
        throw new BadRequestException(`${side} place must be { providerKey, providerPlaceId }`);
      }
      if (!this.locations) throw new BadRequestException(`${side} place references are not supported here`);
      const candidate = await this.locations.resolve({
        providerKey: place.providerKey,
        providerPlaceId: place.providerPlaceId,
      });
      if (!candidate) throw new BadRequestException(`Unknown ${side.toLowerCase()} place selection`);
      const context = buildLogisticsLocationContext(candidate);
      if (!context) throw new BadRequestException('The selected place has no usable city context');
      return {
        keys: context.routeKeys.map((k) => k.key),
        snapshot: {
          source: 'place',
          label: context.label,
          level: context.level,
          placeRef: { providerKey: context.providerKey, providerPlaceId: context.providerPlaceId },
          regionName: candidate.regionName ?? null,
          districtName: candidate.districtName ?? null,
          wardName: candidate.wardName ?? null,
          // Filled in with the routing key that actually matched once an
          // option is selected; the broadest key (region) until then.
          city: context.hubCompatibilityKey,
        },
      };
    }
    if (input && typeof input.text === 'string' && input.text.trim()) {
      const text = input.text.trim();
      if (text.length < DISCOVERY_CITY_MIN || text.length > DISCOVERY_CITY_MAX) {
        throw new BadRequestException(
          `${side} must be between ${DISCOVERY_CITY_MIN} and ${DISCOVERY_CITY_MAX} characters`,
        );
      }
      const context = buildTextLogisticsContext(text);
      return {
        keys: context.routeKeys.map((k) => k.key),
        snapshot: { source: 'text', label: text, city: text },
      };
    }
    if (input !== undefined && input !== null) {
      throw new BadRequestException(`${side} needs a selected place or a typed location`);
    }
    const label = this.legacyNodeLabel(legacySnapshot, side);
    return { keys: [label], snapshot: legacySnapshot as Record<string, unknown> };
  }

  private pairs(origin: ResolvedJourneySide, destination: ResolvedJourneySide) {
    const pairs: Array<{ from: string; to: string }> = [];
    for (const from of origin.keys) for (const to of destination.keys) pairs.push({ from, to });
    return pairs.slice(0, MAX_KEY_PAIRS);
  }

  async compose(dto: ComposeJourneyDto) {
    const cargo = normalizeCargoRequirements(dto.cargoRequirements);
    const origin = await this.resolveSide('Origin', dto.origin, dto.originSnapshot);
    const destination = await this.resolveSide('Destination', dto.destination, dto.destinationSnapshot);
    const weightKg = Number(cargo.weightKg) || 0;

    // The same discovery every other caller uses, run once per routing-key
    // pair and de-duplicated by slot id (first, i.e. most specific, pair wins).
    const slots = new Map<number, any>();
    for (const pair of this.pairs(origin, destination)) {
      const { published } = await this.transport.findAvailableForRoute(pair.from, pair.to, weightKg, {
        sortBy: dto.sortBy,
      });
      for (const slot of published) if (!slots.has(slot.id)) slots.set(slot.id, slot);
    }
    const providerId = dto.providerId != null ? Number(dto.providerId) : null;
    const options = await Promise.all(
      [...slots.values()]
        .filter((slot) => slot.routeId != null)
        .filter((slot) => providerId == null || Number(slot.providerId) === providerId)
        .map(async (slot) => {
          const price = await this.transport.getEffectiveRoutePrice(slot.routeId!);
          const transportBase = Math.max(price.pricePerKg * weightKg, price.fixedFee || 0);
          return {
            optionType: 'DIRECT_TRANSPORT' as const,
            availabilityId: slot.id,
            providerId: slot.providerId,
            routeId: slot.routeId,
            date: slot.date,
            departureTime: slot.departureTime,
            arrivalEstimate: slot.arrivalEstimate,
            transportBase,
            currency: 'TZS' as const,
            commitmentLevel: 'service_confirmed' as const,
          };
        }),
    );
    return {
      origin: origin.snapshot,
      destination: destination.snapshot,
      cargoRequirements: cargo,
      options,
      requiresManualPlanning: options.length === 0,
    };
  }

  async selectComposed(userId: number, dto: SelectComposedJourneyDto) {
    const availabilityId = Number(dto.availabilityId);
    if (!Number.isInteger(availabilityId) || availabilityId <= 0) {
      throw new BadRequestException('A valid availabilityId is required');
    }
    const cargo = normalizeCargoRequirements(dto.cargoRequirements);
    const origin = await this.resolveSide('Origin', dto.origin, dto.originSnapshot);
    const destination = await this.resolveSide('Destination', dto.destination, dto.destinationSnapshot);
    const slot = await this.transport.assertAvailabilityIsDiscoverable(
      availabilityId,
      Number(cargo.weightKg) || 0,
    );
    if (slot.routeId == null) {
      throw new BadRequestException('This availability cannot be composed into a canonical journey');
    }
    if (dto.providerId != null && Number(dto.providerId) !== Number(slot.providerId)) {
      throw new BadRequestException('That trip does not belong to the selected transport provider');
    }
    await this.transport.assertEligibleProvider(slot.providerId);

    // The route must serve this journey under at least one pair of the
    // server-derived routing keys -- the same pairs discovery searched. The
    // pair that matches is recorded on the leg, so every later re-validation
    // (JourneySelectionService, the quote) checks the exact same thing.
    let matched: { from: string; to: string } | null = null;
    let lastError: unknown = null;
    for (const pair of this.pairs(origin, destination)) {
      try {
        await this.transport.assertRouteServesJourney(slot.routeId, pair.from, pair.to);
        matched = pair;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!matched) {
      throw lastError instanceof BadRequestException
        ? lastError
        : new BadRequestException('The selected route does not serve the requested origin/destination');
    }
    const fromNode = { ...origin.snapshot, city: matched.from };
    const toNode = { ...destination.snapshot, city: matched.to };

    return this.selections.select(userId, {
      originSnapshot: origin.snapshot,
      destinationSnapshot: destination.snapshot,
      cargoRequirements: cargo,
      paymentMethod: dto.paymentMethod,
      legs: [{
        type: JourneyLegType.TRANSPORT,
        fromNode,
        toNode,
        providerId: slot.providerId,
        routeId: slot.routeId,
        availabilityId: slot.id,
        executionRequirements: { composedByServer: true },
      }],
    });
  }
}
