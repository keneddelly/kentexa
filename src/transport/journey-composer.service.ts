import { BadRequestException, Injectable } from '@nestjs/common';
import { CargoRequirements, normalizeCargoRequirements } from './journey/cargo-requirements';
import { JourneyCommitmentLevel, JourneyLegType } from './entities/journey-selection.entity';
import { parseTravelDate } from './run-supply';
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
  // Gate 2: an optional Tanzania calendar day ('YYYY-MM-DD') to look at.
  date?: string;
}

export interface SelectServiceJourneyDto extends ComposeJourneyDto {
  providerId: number;
  routeId: number;
  /** Optional concrete Run selected from bookable transport supply. */
  runId?: number;
}

export interface SelectComposedJourneyDto extends ComposeJourneyDto {
  // Gate 2: the option the client names is a Transport Run the server
  // offered. Nothing else about the leg is taken from the request.
  runId: number;
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
    // pair and de-duplicated by Run id (first, i.e. most specific, pair wins
    // and so decides the stops the parcel loads and unloads at).
    const providerId = dto.providerId != null ? Number(dto.providerId) : undefined;
    const onDate = dto.date ? parseTravelDate(dto.date) : undefined;
    const runs = new Map<number, any>();
    for (const pair of this.pairs(origin, destination)) {
      const { trips } = await this.transport.discoverSupply(pair.from, pair.to, weightKg, {
        sortBy: dto.sortBy, providerId, onDate,
      });
      for (const trip of trips) if (!runs.has(trip.runId)) runs.set(trip.runId, trip);
    }
    const options = await Promise.all(
      [...runs.values()].map(async (trip) => {
        const price = await this.transport.getEffectiveRoutePrice(trip.routeId);
        const transportBase = Math.max(price.pricePerKg * weightKg, price.fixedFee || 0);
        return {
          optionType: 'DIRECT_TRANSPORT' as const,
          runId: trip.runId,
          providerId: trip.providerId,
          routeId: trip.routeId,
          date: trip.date,
          departureTime: trip.departureTime,
          departureAt: new Date(trip.departureAt).toISOString(),
          loadStop: trip.loadLabel,
          unloadStop: trip.unloadLabel,
          slotsAvailable: trip.slotsAvailable,
          transportBase,
          currency: 'TZS' as const,
          commitmentLevel: JourneyCommitmentLevel.RUN_CONFIRMED,
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

  /**
   * Freeze a customer's chosen transport SERVICE before a concrete run exists.
   * The server re-discovers the provider/route against its own routing keys,
   * then stores a SERVICE_CONFIRMED transport leg. No capacity or custody is
   * implied here; execution must later bind a real TransportRun and re-check
   * run capacity/status before linehaul starts.
   */
  async selectService(userId: number, dto: SelectServiceJourneyDto & { pickup?: 'door' | 'point'; delivery?: 'door' | 'collect' }) {
    const providerId = Number(dto?.providerId);
    const routeId = Number(dto?.routeId);
    if (!Number.isInteger(providerId) || providerId <= 0 || !Number.isInteger(routeId) || routeId <= 0) {
      throw new BadRequestException('A valid providerId and routeId are required');
    }
    const cargo = normalizeCargoRequirements(dto.cargoRequirements);
    const origin = await this.resolveSide('Origin', dto.origin, dto.originSnapshot);
    const destination = await this.resolveSide('Destination', dto.destination, dto.destinationSnapshot);
    const weightKg = Number(cargo.weightKg) || 0;

    let matched: { from: string; to: string } | null = null;
    for (const pair of this.pairs(origin, destination)) {
      const services = await this.transport.discoverServiceRoutes(pair.from, pair.to, weightKg, providerId);
      if (services.some((s) => s.providerId === providerId && s.routeId === routeId)) {
        matched = pair;
        break;
      }
    }
    if (!matched) {
      throw new BadRequestException('That transport service no longer serves this shipment');
    }

    let selectedRun: any = null;
    const requestedRunId = Number(dto.runId);
    if (Number.isInteger(requestedRunId) && requestedRunId > 0) {
      // A sender may only commit a Run that was actually offered for this
      // provider/route and exact origin/destination. This keeps the Journey
      // and the Transporter's execution Run connected from the moment the
      // Shipment is created.
      selectedRun = await this.transport.assertRunServes(
        requestedRunId,
        matched.from,
        matched.to,
        weightKg,
        { providerId, routeId },
      );
    }
    const transportFrom = { ...origin.snapshot, city: matched.from, ...(selectedRun ? { stop: selectedRun.loadLabel } : {}) };
    const transportTo = { ...destination.snapshot, city: matched.to, ...(selectedRun ? { stop: selectedRun.unloadLabel } : {}) };
    const legs: any[] = [];
    // The committed Journey is the fulfillment authority. Door/point choices
    // are materialized here instead of being re-inferred later by the legacy
    // Shipment hub/direct-delivery state machine.
    if (dto.pickup === 'door') {
      legs.push({
        type: JourneyLegType.FIRST_MILE,
        fromNode: origin.snapshot,
        toNode: transportFrom,
        requiredActorCapability: 'local_agent',
        commitmentLevel: JourneyCommitmentLevel.SERVICE_CONFIRMED,
        executionRequirements: { composedByServer: true, servicePath: 'door_to_transport', handoffResolutionRequired: true },
      });
    } else {
      legs.push({
        type: JourneyLegType.HUB_INTAKE,
        fromNode: origin.snapshot,
        toNode: transportFrom,
        requiredActorCapability: 'kentexa_point',
        commitmentLevel: JourneyCommitmentLevel.SERVICE_CONFIRMED,
        executionRequirements: { composedByServer: true, servicePath: 'customer_dropoff', handoffResolutionRequired: true },
      });
    }
    legs.push({
      type: JourneyLegType.TRANSPORT,
      fromNode: transportFrom,
      toNode: transportTo,
      providerId,
      routeId,
      runId: selectedRun?.runId ?? null,
      loadRouteStopId: selectedRun?.loadRouteStopId ?? null,
      unloadRouteStopId: selectedRun?.unloadRouteStopId ?? null,
      commitmentLevel: selectedRun ? JourneyCommitmentLevel.RUN_CONFIRMED : JourneyCommitmentLevel.SERVICE_CONFIRMED,
      executionRequirements: selectedRun
        ? {
            composedByServer: true,
            servicePath: 'route_service',
            runResolutionRequired: false,
            loadRunStopId: selectedRun.loadRunStopId,
            unloadRunStopId: selectedRun.unloadRunStopId,
            scheduledDeparture: new Date(selectedRun.departureAt).toISOString(),
          }
        : { composedByServer: true, servicePath: 'route_service', runResolutionRequired: true },
    });
    if (dto.delivery === 'door') {
      legs.push({
        type: JourneyLegType.LAST_MILE,
        fromNode: transportTo,
        toNode: destination.snapshot,
        requiredActorCapability: 'local_agent',
        commitmentLevel: JourneyCommitmentLevel.SERVICE_CONFIRMED,
        executionRequirements: { composedByServer: true, servicePath: 'transport_to_door', handoffResolutionRequired: true },
      });
    } else {
      legs.push({
        type: JourneyLegType.CUSTOMER_PICKUP,
        fromNode: transportTo,
        toNode: destination.snapshot,
        requiredActorCapability: 'kentexa_point',
        commitmentLevel: JourneyCommitmentLevel.SERVICE_CONFIRMED,
        executionRequirements: { composedByServer: true, servicePath: 'customer_collect', handoffResolutionRequired: true },
      });
    }
    return this.selections.select(userId, {
      originSnapshot: origin.snapshot,
      destinationSnapshot: destination.snapshot,
      cargoRequirements: cargo,
      paymentMethod: dto.paymentMethod,
      legs,
    });
  }

  async selectComposed(userId: number, dto: SelectComposedJourneyDto) {
    const runId = Number(dto?.runId);
    if (!Number.isInteger(runId) || runId <= 0) {
      // An app installed before Gate 2 names a legacy slot instead. Those
      // are no longer bookable; a fresh search offers the Run to pick.
      throw new BadRequestException('Choose a trip from a fresh search: a valid runId is required');
    }
    const cargo = normalizeCargoRequirements(dto.cargoRequirements);
    const origin = await this.resolveSide('Origin', dto.origin, dto.originSnapshot);
    const destination = await this.resolveSide('Destination', dto.destination, dto.destinationSnapshot);
    const weightKg = Number(cargo.weightKg) || 0;
    const ctx = dto.providerId != null ? { providerId: Number(dto.providerId) } : {};

    // Gone, closed, departed, full or another provider's: each its own error.
    await this.transport.assertRunBookable(runId, weightKg, ctx);

    // The Run must serve this journey under at least one pair of the
    // server-derived routing keys -- the same pairs discovery searched, in
    // the same order. The pair that matches is recorded on the leg, together
    // with the stops it matched, so every later re-validation
    // (JourneySelectionService, the quote) checks the exact same thing.
    let matched: { from: string; to: string } | null = null;
    let trip: any = null;
    for (const pair of this.pairs(origin, destination)) {
      trip = await this.transport.findBookableRun(runId, pair.from, pair.to, weightKg);
      if (trip) { matched = pair; break; }
    }
    if (!matched || !trip) {
      throw new BadRequestException('The selected trip does not serve the requested origin/destination');
    }
    await this.transport.assertEligibleProvider(trip.providerId);
    const fromNode = { ...origin.snapshot, city: matched.from, stop: trip.loadLabel };
    const toNode = { ...destination.snapshot, city: matched.to, stop: trip.unloadLabel };

    return this.selections.select(userId, {
      originSnapshot: origin.snapshot,
      destinationSnapshot: destination.snapshot,
      cargoRequirements: cargo,
      paymentMethod: dto.paymentMethod,
      legs: [{
        type: JourneyLegType.TRANSPORT,
        fromNode,
        toNode,
        providerId: trip.providerId,
        routeId: trip.routeId,
        runId: trip.runId,
        loadRouteStopId: trip.loadRouteStopId,
        unloadRouteStopId: trip.unloadRouteStopId,
        commitmentLevel: JourneyCommitmentLevel.RUN_CONFIRMED,
        executionRequirements: {
          composedByServer: true,
          // The Run's own immutable stops (Gate 5 tenders the parcel from these).
          loadRunStopId: trip.loadRunStopId,
          unloadRunStopId: trip.unloadRunStopId,
          scheduledDeparture: new Date(trip.departureAt).toISOString(),
        },
      }],
    });
  }

  /**
   * Gate 3: a Journey with ZERO transport legs -- an Agent collects from the
   * sender and delivers to the recipient directly, inside one region.
   *
   * Composed entirely by the server: two legs for "an Agent" (the role, not
   * a person -- the Agent who later claims the work is resolved from their
   * own authenticated session), from and to the two server-resolved places.
   * Both sides must be places the sender selected, because "the same region"
   * has to be something the server knows, not something typed.
   */
  async selectDirectDelivery(userId: number, dto: ComposeJourneyDto) {
    const cargo = normalizeCargoRequirements(dto.cargoRequirements);
    const origin = await this.resolveSide('Origin', dto.origin, dto.originSnapshot);
    const destination = await this.resolveSide('Destination', dto.destination, dto.destinationSnapshot);
    const region = (side: ResolvedJourneySide) =>
      side.snapshot.source === 'place' && typeof side.snapshot.regionName === 'string'
        ? side.snapshot.regionName.trim().toLowerCase()
        : '';
    if (!region(origin) || !region(destination)) {
      throw new BadRequestException('Choose both places from the list to use direct Agent delivery');
    }
    if (region(origin) !== region(destination)) {
      throw new BadRequestException('Direct Agent delivery is available within one region only');
    }
    const agent = { kind: 'agent', role: 'local_agent' };
    const requirements = { composedByServer: true, servicePath: 'direct_delivery' };
    return this.selections.select(userId, {
      originSnapshot: origin.snapshot,
      destinationSnapshot: destination.snapshot,
      cargoRequirements: cargo,
      paymentMethod: dto.paymentMethod,
      legs: [
        {
          type: JourneyLegType.FIRST_MILE, fromNode: origin.snapshot, toNode: agent,
          requiredActorCapability: 'local_agent', executionRequirements: requirements,
        },
        {
          type: JourneyLegType.LAST_MILE, fromNode: agent, toNode: destination.snapshot,
          requiredActorCapability: 'local_agent', executionRequirements: requirements,
        },
      ],
    });
  }
}
