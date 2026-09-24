/**
 * ShipmentsService — the demand-side counterpart to TransportService.
 * Place at: src/shipments/shipments.service.ts
 *
 * Every method here is a clean, independently-callable, typed domain
 * capability (findAvailableRoutes / estimateShipmentPrice / createShipment /
 * getMyShipments / trackShipment) — deliberately not baked into
 * controller-only logic, so a future platform-wide AI tool-calling layer
 * (which doesn't exist anywhere in Kentexa yet — not built here either)
 * could wrap these without a Transport-specific redesign.
 *
 * Never invents route/price/capacity data — everything here reads from or
 * writes through the EXISTING supply model (TransportService/TransportRoute/
 * ProviderAvailability); this module owns demand, not supply.
 */
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { capacityWeightKg } from '../transport/slot-capacity';
import { Shipment, ShipmentStatus, ShipmentHandoffOption } from './entities/shipment.entity';
import { TransportRoute } from '../transport/entities/transport-route.entity';
import { TransportService } from '../transport/transport.service';
import { TzLocationService } from '../tz-location/tz-location.service';
import { Parcel, ParcelStatus } from '../super-agents/entities/parcel.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { LocationIntelligenceService } from '../location-intelligence/location-intelligence.service';
import { LocationCandidate } from '../location-intelligence/location-provider.interface';
import { ShipmentHubSource } from './shipment-hub-source';
import {
  LogisticsSide,
  MAX_KEY_PAIRS,
  RouteKey,
  RouteKeyKind,
  buildLogisticsLocationContext,
  buildTextLogisticsContext,
} from './logistics-location-context';
import {
  HubCandidate,
  HubDecision,
  HubSelectionInput,
  HubSide,
  NO_HUB_INPUT,
  anyHubRequested,
  assertNoDecisionConflict,
  decideHubForSide,
  decisionConflictError,
  discoverHubCandidates,
  hubRepoOf,
  parseHubSelectionInput,
  parseHubSide,
  storedSideHubKeys,
} from './shipment-hub-selection';
import {
  PlaceSelection,
  deriveLegacyRoutingCity,
  readStoredSnapshotSide,
  snapshotFromFreeText,
  snapshotFromResolvedPlace,
  toDestinationSnapshotColumns,
  toOriginSnapshotColumns,
} from './shipment-location-snapshot';

// Public, unauthenticated projection for GET /shipments/track/:trackingNumber.
// Deliberately excludes id, requestedByUserId, sender/receiver phone
// numbers, and every loose internal id (routeId/availabilityId/providerId/
// originWardId/destinationWardId) — a receiver tracking a shipment has no
// account and no business seeing any of Kentexa's internal bookkeeping.
export interface PublicShipmentTracking {
  trackingNumber: string | null;
  status: ShipmentStatus;
  originCity: string;
  destinationCity: string;
  itemDescription: string;
  weightKg: number;
  pickupOption: ShipmentHandoffOption;
  deliveryOption: ShipmentHandoffOption;
  receiverName: string;
  collectedAt: Date | null;
  deliveredAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  parcelTrackingNumber: string | null;
}

// One side of a route-discovery request: a selected place reference OR free text.
export interface DiscoverySideInput {
  place?: { providerKey: string; providerPlaceId: string };
  text?: string;
}

// Diagnostic only: which key pair produced a hit. Never a selection.
export interface MatchedOn {
  originKey: string;
  originKind: RouteKeyKind;
  destinationKey: string;
  destinationKind: RouteKeyKind;
}

export interface CreateShipmentDto {
  senderName?: string;
  senderPhone?: string;
  receiverName: string;
  receiverPhone: string;
  // ── Where from / to: EITHER a selected place OR free text, per side ───────
  // originPlace/destinationPlace: a REFERENCE to a place the user selected from
  // GET /location-intelligence/places ({providerKey, providerPlaceId}). The
  // server re-resolves it exactly and derives the snapshot, provenance,
  // coordinates and the legacy city/region/ward columns ITSELF; when present it
  // takes precedence over every free-text/legacy field of that side. The client
  // can never assert coordinates, names, providerKey or resolutionMethod (the
  // Stage 2B originLocation/destinationLocation input was retired; any such
  // property is ignored).
  originPlace?: PlaceSelection;
  destinationPlace?: PlaceSelection;
  // Free-text path (no place selected): the typed city is required, the
  // snapshot is a server-authored 'user_typed' one (no coordinates, no admin
  // claims). originRegionId/originWardId are legacy, UNVERIFIED hints kept only
  // for compatibility on this path -- they are never provenance and never
  // reach the snapshot. Ignored entirely when a place is selected.
  originCity?: string;
  originWard?: string;
  originRegionId?: number;
  originWardId?: number;
  destinationCity?: string;
  destinationWard?: string;
  destinationRegionId?: number;
  destinationWardId?: number;
  itemDescription: string;
  weightKg?: number;
  routeId?: number;
  availabilityId?: number;
  providerId?: number;
  pickupOption?: ShipmentHandoffOption;
  deliveryOption?: ShipmentHandoffOption;
}

// Stage 2F: hub selection is EXPLICIT and independent of pickupOption/
// deliveryOption. A side is hub-mediated only when the sender supplies its hub
// id or sets its request flag; otherwise that side's decision is 'not_required'.
export interface ConfirmShipmentDto {
  providerId?: number;
  availabilityId?: number;
  routeId?: number;
  originHubId?: number;
  destinationHubId?: number;
  requestOriginHub?: boolean;
  requestDestinationHub?: boolean;
}

// The shape returned by both hub-discovery doors. Sender-safe fields only.
export interface HubDiscoveryResult {
  side: HubSide;
  resolved: boolean;
  place: { label: string | null } | null;
  matchedOn: { keys: string[] };
  count: number;
  hubs: HubCandidate[];
  // Shipment-bound door only: the stored (immutable) decision, if any.
  decision?: { source: ShipmentHubSource; hubId: number | null } | null;
}

@Injectable()
export class ShipmentsService {
  // Only these transitions are reachable via the controlled state machine —
  // no arbitrary jumps (e.g. never COMPLETED -> PENDING), and CANCELLED is
  // only reachable before physical collection has started.
  private static readonly VALID_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
    [ShipmentStatus.PENDING]: [ShipmentStatus.CONFIRMED, ShipmentStatus.CANCELLED],
    [ShipmentStatus.CONFIRMED]: [ShipmentStatus.COLLECTED, ShipmentStatus.CANCELLED],
    [ShipmentStatus.COLLECTED]: [ShipmentStatus.IN_TRANSIT],
    [ShipmentStatus.IN_TRANSIT]: [ShipmentStatus.DELIVERED],
    [ShipmentStatus.DELIVERED]: [ShipmentStatus.COMPLETED],
    [ShipmentStatus.COMPLETED]: [],
    [ShipmentStatus.CANCELLED]: [],
  };

  constructor(
    @InjectRepository(Shipment) private shipmentRepo: Repository<Shipment>,
    @InjectRepository(TransportRoute) private routeRepo: Repository<TransportRoute>,
    @InjectRepository(Parcel) private parcelRepo: Repository<Parcel>,
    @InjectRepository(SuperAgent) private superAgentRepo: Repository<SuperAgent>,
    private readonly transportService: TransportService,
    private readonly tzLocation: TzLocationService,
    private readonly locationIntelligence: LocationIntelligenceService,
  ) {}

  // Re-resolves a client-selected place reference EXACTLY (no name search, no
  // fallback). An absent selection is fine (free-text path); a present-but-
  // unresolvable one is a 400 and nothing has been written or reserved yet.
  private async resolvePlaceSelection(
    side: 'origin' | 'destination',
    selection: PlaceSelection | undefined,
  ): Promise<{ candidate: LocationCandidate; localityText: unknown } | null> {
    if (selection === undefined || selection === null) return null;
    if (
      typeof selection !== 'object' ||
      typeof selection.providerKey !== 'string' ||
      typeof selection.providerPlaceId !== 'string'
    ) {
      throw new BadRequestException(`Invalid ${side} place selection`);
    }
    const candidate = await this.locationIntelligence.resolve({
      providerKey: selection.providerKey,
      providerPlaceId: selection.providerPlaceId,
    });
    if (!candidate) throw new BadRequestException(`Unknown ${side} place selection`);
    return { candidate, localityText: selection.localityText };
  }

  private async resolveRegionId(city: string | null | undefined): Promise<number | null> {
    if (!city?.trim()) return null;
    try {
      const results = await this.tzLocation.search(city.trim());
      return results?.[0]?.regionId ?? null;
    } catch {
      return null;
    }
  }

  // Real available trips + verified providers -- reuses
  // TransportService.findAvailableForRoute() rather than re-querying, so this
  // can never drift from what super-agent dispatch already sees.
  // weightKg, when given, hard-excludes anything that can't structurally
  // carry it (see findAvailableForRoute's own doc comment) — a 20ft
  // container search should never surface a boda or courier.
  //
  // Legacy string API: both sides typed text. Behaviour is unchanged for
  // legitimate input (the shared public path is hardened: trimmed 2..80
  // chars, LIKE wildcards literal); the response gains explanatory blocks.
  async findAvailableRoutes(origin: string, destination: string, weightKg = 0) {
    if (!origin?.trim() || !destination?.trim()) {
      throw new BadRequestException('Origin and destination are required');
    }
    return this.findAvailableRoutesForSides({ text: origin }, { text: destination }, weightKg);
  }

  // Stage 2E: place-aware discovery. Each side is EITHER a selected place
  // reference (re-resolved by the server, exactly, then turned into ordered
  // routing keys by the explicit LogisticsLocationContext policy) OR free text
  // (used as typed, labelled unresolved, never enriched). A place wins over
  // text for its side; neither => 400; a mixed request is fine.
  //
  // This returns CANDIDATES, never a decision: the existing discovery runs for
  // each (bounded) pair of keys, results are unioned and de-duplicated
  // deterministically, and every item says which keys matched (diagnostic
  // only). 0, 1 or many results are all lists for the caller to choose from;
  // binding a Shipment to a route/provider/slot stays the explicit,
  // Stage-2C-validated routeId/providerId/availabilityId of createShipment/
  // confirmShipment. No hub is selected, ranked or returned.
  async findAvailableRoutesForSides(
    originSide: DiscoverySideInput,
    destinationSide: DiscoverySideInput,
    weightKg = 0,
  ) {
    const [origin, destination] = await Promise.all([
      this.resolveDiscoverySide('origin', originSide),
      this.resolveDiscoverySide('destination', destinationSide),
    ]);

    const pairs: Array<{ o: RouteKey; d: RouteKey }> = [];
    for (const o of origin.routeKeys) for (const d of destination.routeKeys) pairs.push({ o, d });
    if (pairs.length > MAX_KEY_PAIRS) {
      throw new Error('discovery key-pair bound exceeded'); // unreachable: per-side keys are bounded
    }

    // Sequential index order (origin-major) => deterministic merge order.
    const results = await Promise.all(
      pairs.map((pair) =>
        this.transportService.findAvailableForRoute(pair.o.key, pair.d.key, weightKg),
      ),
    );

    const trips = new Map<number, { row: any; matchedOn: MatchedOn[] }>();
    const providers = new Map<number, { row: any; matchedOn: MatchedOn[] }>();
    results.forEach((result, i) => {
      const matched: MatchedOn = {
        originKey: pairs[i].o.key,
        originKind: pairs[i].o.kind,
        destinationKey: pairs[i].d.key,
        destinationKind: pairs[i].d.kind,
      };
      for (const a of result.published) {
        const seen = trips.get(a.id);
        if (seen) seen.matchedOn.push(matched);
        else trips.set(a.id, { row: a, matchedOn: [matched] });
      }
      for (const pr of result.providers) {
        const seen = providers.get(pr.id);
        if (seen) seen.matchedOn.push(matched);
        else providers.set(pr.id, { row: pr, matchedOn: [matched] });
      }
    });

    const tripList = [...trips.values()].sort(
      (x, y) =>
        String(x.row.date).localeCompare(String(y.row.date)) ||
        String(x.row.departureTime ?? '').localeCompare(String(y.row.departureTime ?? '')) ||
        x.row.id - y.row.id,
    );
    const providerList = [...providers.values()].sort(
      (x, y) => (Number(y.row.rating) || 0) - (Number(x.row.rating) || 0) || x.row.id - y.row.id,
    );

    return {
      availableTrips: tripList.map(({ row: a, matchedOn }) => ({
        availabilityId: a.id,
        providerId: a.providerId,
        providerName: (a as any).provider?.name ?? null,
        providerLogo: (a as any).provider?.logoUrl ?? null,
        providerType: (a as any).provider?.type ?? null,
        routeId: a.routeId,
        date: a.date,
        departureTime: a.departureTime,
        arrivalEstimate: a.arrivalEstimate,
        slotsAvailable: Math.max(0, a.totalSlots - a.usedSlots),
        capacityAvailableKg: Math.max(0, Number(a.totalCapacityKg) - Number(a.usedCapacityKg)),
        pricePerKg: (a as any).route?.pricePerKg ?? null,
        fixedFee: (a as any).route?.fixedFee ?? null,
        matchedOn,
      })),
      providers: providerList.map(({ row: p, matchedOn }) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        logoUrl: p.logoUrl,
        rating: Number(p.rating) || 0,
        whatsappPhone: p.whatsappPhone,
        contactPhone: p.contactPhone,
        matchedOn,
      })),
      origin: this.describeSide(origin),
      destination: this.describeSide(destination),
    };
  }

  private async resolveDiscoverySide(
    side: 'origin' | 'destination',
    input: DiscoverySideInput,
  ): Promise<LogisticsSide> {
    if (input.place) {
      const candidate = await this.locationIntelligence.resolve({
        providerKey: input.place.providerKey,
        providerPlaceId: input.place.providerPlaceId,
      });
      if (!candidate) throw new BadRequestException(`Unknown ${side} place selection`);
      const context = buildLogisticsLocationContext(candidate);
      if (!context) throw new BadRequestException('The selected place has no usable city context');
      return context;
    }
    if (typeof input.text === 'string' && input.text.trim()) {
      return buildTextLogisticsContext(input.text.trim());
    }
    throw new BadRequestException(`A ${side} place or city is required`);
  }

  // Public, explanatory view of a side: never coordinates or internal ids.
  private describeSide(side: LogisticsSide) {
    if (side.source === 'place') {
      return {
        source: 'place' as const,
        resolved: true,
        label: side.label,
        level: side.level,
        placeRef: { providerKey: side.providerKey, providerPlaceId: side.providerPlaceId },
        keys: side.routeKeys,
      };
    }
    return { source: 'text' as const, resolved: false, keys: side.routeKeys };
  }

  // Price comes from the route's own configured rate — never estimated by
  // guesswork. fixedFee acts as a floor (matches how a provider would
  // actually charge a very light parcel).
  async estimateShipmentPrice(routeId: number, weightKg: number): Promise<number> {
    const route = await this.routeRepo.findOne({ where: { id: routeId } });
    if (!route) throw new NotFoundException('Route not found');
    const byWeight = Number(route.pricePerKg) * (weightKg || 0);
    return Math.max(byWeight, Number(route.fixedFee) || 0);
  }

  async createShipment(userId: number, dto: CreateShipmentDto): Promise<Shipment> {
    if (!dto.receiverName?.trim() || !dto.receiverPhone?.trim()) {
      throw new BadRequestException('Receiver name and phone are required');
    }
    // Each side needs EITHER a selected place OR a typed city.
    if (
      (!dto.originPlace && !dto.originCity?.trim()) ||
      (!dto.destinationPlace && !dto.destinationCity?.trim())
    ) {
      throw new BadRequestException('Origin and destination are required');
    }
    if (!dto.itemDescription?.trim()) {
      throw new BadRequestException('Describe what you are sending');
    }

    // Selected places are re-resolved by the SERVER, exactly. This happens
    // before anything is reserved or written, so an unknown/forged/malformed
    // reference is a clean 400.
    const [origin, destination] = await Promise.all([
      this.resolvePlaceSelection('origin', dto.originPlace),
      this.resolvePlaceSelection('destination', dto.destinationPlace),
    ]);
    const side = (
      resolved: { candidate: LocationCandidate; localityText: unknown } | null,
      typedCity: string | undefined,
      typedWard: string | undefined,
      typedRegionId: number | undefined,
      typedWardId: number | undefined,
    ) => {
      if (resolved) {
        // Compatibility columns come from the resolved place through ONE
        // explicit policy (see deriveLegacyRoutingCity) and NOTHING else: if
        // the place has no region context we refuse -- we never fall back to
        // the request's typed city, which is ignored on a resolved side.
        const city = deriveLegacyRoutingCity(resolved.candidate);
        if (!city) throw new BadRequestException('The selected place has no usable city context');
        return {
          city,
          regionId: Promise.resolve(resolved.candidate.regionId ?? null),
          ward: resolved.candidate.wardName ?? null,
          wardId: resolved.candidate.wardId ?? null,
          snapshot: snapshotFromResolvedPlace(resolved.candidate, resolved.localityText),
        };
      }
      // Free text: typed values as before; the region falls back to the legacy
      // (fuzzy, first-result) resolution, a hint only; the snapshot is
      // server-authored 'user_typed' with no coordinates or admin claims.
      const cityText = typedCity!.trim();
      return {
        city: cityText,
        regionId: typedRegionId != null ? Promise.resolve(typedRegionId) : this.resolveRegionId(cityText),
        ward: typedWard?.trim() || null,
        wardId: typedWardId || null,
        snapshot: snapshotFromFreeText([typedWard?.trim(), cityText].filter(Boolean).join(', ')),
      };
    };
    const o = side(origin, dto.originCity, dto.originWard, dto.originRegionId, dto.originWardId);
    const d = side(destination, dto.destinationCity, dto.destinationWard, dto.destinationRegionId, dto.destinationWardId);
    const [originRegionId, destinationRegionId] = await Promise.all([o.regionId, d.regionId]);

    // A providerId on create is only a stored SELECTION -- it never confirms
    // anything (see status below). Still validated here with the canonical
    // provider policy so a nonexistent/unverified/suspended provider is
    // rejected up front, before any capacity is reserved or row inserted.
    // confirmShipment() re-validates, since provider state can change.
    if (dto.providerId) {
      await this.transportService.assertEligibleProvider(dto.providerId);
    }

    // Non-finite / negative weights are rejected up front (they would corrupt
    // the capacity arithmetic); unspecified stays 0 exactly as before.
    const weightKg = this.normalizeWeightKg(dto.weightKg);

    let priceQuoted: number | null = null;
    if (dto.routeId) {
      priceQuoted = await this.estimateShipmentPrice(dto.routeId, weightKg);
    }

    // Capacity boundary: a reservation FOLLOWS availabilityId -- acquired
    // when a slot is first attached to a Shipment (here, or in
    // confirmShipment if the slot changes), released when detached or on
    // cancel. It is deliberately not deferred to confirmation: pre-existing
    // PENDING rows already hold their reservation from creation, and moving
    // it would double-reserve them. A shipment against a chosen slot is real
    // demand whether or not a TransportAssignment is created later.
    //
    // Reserve + insert + tracking number are ONE transaction, and every
    // write inside it goes through that transaction's EntityManager: if the
    // slot can't be validly reserved nothing is inserted, and if any later
    // write fails the reservation rolls back with it (no leaked slot).
    return this.shipmentRepo.manager.transaction(async (em) => {
      const shipments = em.getRepository(Shipment);
      if (dto.availabilityId) {
        await this.transportService.reserveSlot(
          dto.availabilityId,
          capacityWeightKg(weightKg),
          { providerId: dto.providerId, routeId: dto.routeId },
          em,
        );
      }

      const saved = await shipments.save(
        shipments.create({
          requestedByUserId: userId,
          senderName: dto.senderName?.trim() || null,
          senderPhone: dto.senderPhone?.trim() || null,
          receiverName: dto.receiverName.trim(),
          receiverPhone: dto.receiverPhone.trim(),
          originCity: o.city,
          originRegionId,
          originWard: o.ward,
          originWardId: o.wardId,
          destinationCity: d.city,
          destinationRegionId,
          destinationWard: d.ward,
          destinationWardId: d.wardId,
          ...toOriginSnapshotColumns(o.snapshot),
          ...toDestinationSnapshotColumns(d.snapshot),
          itemDescription: dto.itemDescription.trim(),
          weightKg,
          routeId: dto.routeId || null,
          availabilityId: dto.availabilityId || null,
          providerId: dto.providerId || null,
          pickupOption: dto.pickupOption || ShipmentHandoffOption.AGENT,
          deliveryOption: dto.deliveryOption || ShipmentHandoffOption.AGENT,
          priceQuoted,
          // Always PENDING. CONFIRMED is reachable only through
          // confirmShipment(), the one boundary that claims the transition,
          // handles capacity and creates the Parcel. Minting CONFIRMED here
          // used to produce a Shipment with no Parcel that could never be
          // confirmed afterwards.
          status: ShipmentStatus.PENDING,
        }),
      );

      // KTX-SHP-{id} — same "id-derived, set once, never regenerated"
      // convention already used for orders (KTX-ORD-{id}).
      saved.trackingNumber = `KTX-SHP-${saved.id}`;
      return shipments.save(saved);
    });
  }

  // One canonical numeric rule for the stored shipment weight: unspecified
  // stays 0 (as before), anything non-finite or negative is rejected.
  private normalizeWeightKg(raw: unknown): number {
    if (raw === undefined || raw === null || raw === '') return 0;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      throw new BadRequestException('weightKg must be a non-negative number');
    }
    return n;
  }

  async getMyShipments(userId: number): Promise<Shipment[]> {
    return this.shipmentRepo.find({
      where: { requestedByUserId: userId },
      order: { createdAt: 'DESC' },
    });
  }

  // Public, unauthenticated — a receiver who never created a Kentexa
  // account still needs to track a shipment addressed to them. Returns a
  // curated PublicShipmentTracking projection only (see its own doc
  // comment for exactly what is and isn't included) rather than spreading
  // the raw Shipment entity. Once a Parcel exists, the frontend re-fetches
  // /super-agents/track/:parcelTrackingNumber for the richer, already-curated
  // Parcel view — this method never grows to replicate that shape itself.
  async trackShipment(trackingNumber: string): Promise<PublicShipmentTracking> {
    const s = await this.shipmentRepo.findOne({ where: { trackingNumber } });
    if (!s) throw new NotFoundException('Shipment not found');
    const parcel = await this.parcelRepo.findOne({
      where: { shipment: { id: s.id } },
    });
    return {
      trackingNumber: s.trackingNumber,
      status: s.status,
      originCity: s.originCity,
      destinationCity: s.destinationCity,
      itemDescription: s.itemDescription,
      weightKg: s.weightKg,
      pickupOption: s.pickupOption,
      deliveryOption: s.deliveryOption,
      receiverName: s.receiverName,
      collectedAt: s.collectedAt,
      deliveredAt: s.deliveredAt,
      completedAt: s.completedAt,
      createdAt: s.createdAt,
      parcelTrackingNumber: parcel?.trackingNumber || null,
    };
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  // Beyond creation, a Shipment previously had no update path at all — every
  // row sat frozen at PENDING/CONFIRMED forever. confirmShipment()/
  // cancelShipment() are the two transitions reachable directly (before a
  // Parcel exists); everything past CONFIRMED is driven by real transport
  // events once the Parcel is born (see TransportService.syncParcelFromAssignment,
  // which mirrors Parcel status changes back onto the linked Shipment) —
  // deliberately not a second, independently-editable status machine.
  private assertTransition(current: ShipmentStatus, next: ShipmentStatus): void {
    const allowed = ShipmentsService.VALID_TRANSITIONS[current] || [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Cannot move shipment from "${current}" to "${next}"`,
      );
    }
  }

  // The single canonical confirmation boundary. This is the ONLY place a
  // Shipment becomes CONFIRMED and the only place its Parcel is created --
  // createShipment() never confirms, whatever it is given.
  //
  // PENDING -> CONFIRMED is an atomic conditional claim
  // (UPDATE ... WHERE id = ? AND status = 'pending'). Only the caller that
  // wins the claim performs side effects (slot change), so a retried or
  // concurrent confirmation can never reserve capacity twice. Anyone else --
  // a client retry, a lost race, or a legacy row that was born CONFIRMED --
  // takes completeConfirmedShipment(): no Shipment write, no capacity change,
  // just "make sure exactly one Parcel exists". Location snapshot columns are
  // never part of any write here.
  async confirmShipment(
    userId: number,
    shipmentId: number,
    dto: ConfirmShipmentDto,
  ): Promise<{ shipment: Shipment; parcel: Parcel }> {
    const shipment = await this.shipmentRepo.findOne({ where: { id: shipmentId } });
    if (!shipment) throw new NotFoundException('Shipment not found');
    if (shipment.requestedByUserId !== userId) {
      throw new ForbiddenException('Not your shipment');
    }
    // Shape-validated up front (400), before any lock or write. The request
    // only ever NAMES a hub; whether it is eligible is decided under lock.
    const hubInputs = this.parseHubInputs(dto);

    if (shipment.status === ShipmentStatus.CONFIRMED) {
      return this.completeConfirmedShipment(shipment, hubInputs);
    }
    this.assertTransition(shipment.status, ShipmentStatus.CONFIRMED);

    const providerId = dto.providerId ?? shipment.providerId;
    if (!providerId) {
      throw new BadRequestException('Select a provider before confirming');
    }
    // Delegated to the transport domain's own provider policy — never
    // redefined here. A nonexistent/unverified/suspended provider fails
    // closed with the same error createAssignment() already gives.
    await this.transportService.assertEligibleProvider(providerId);

    const updates: Partial<Shipment> = {
      status: ShipmentStatus.CONFIRMED,
      providerId,
    };
    const switchesSlot =
      !!dto.availabilityId && dto.availabilityId !== shipment.availabilityId;
    if (switchesSlot) updates.availabilityId = dto.availabilityId;
    if (dto.routeId) updates.routeId = dto.routeId;

    // Claim + capacity are ONE transaction (every write below goes through
    // this transaction's EntityManager): the PENDING->CONFIRMED claim, the
    // reservation of a new slot and the release of the superseded one commit
    // together or not at all, so CONFIRMED always implies its capacity is
    // committed and a lost claim rolls the capacity changes back. The claim
    // is first, so a loser does nothing else. Parcel creation stays AFTER
    // commit (idempotent, retry-completable, never touches capacity).
    const finalRouteId = dto.routeId || shipment.routeId;
    const outcome = await this.shipmentRepo.manager.transaction(async (em) => {
      const claim = await em
        .getRepository(Shipment)
        .update({ id: shipment.id, status: ShipmentStatus.PENDING }, updates);
      if (claim?.affected === 0) return 'lost' as const;

      // Stage 2F hub decision: made HERE, after winning the claim (a loser
      // takes no hub locks) and BEFORE anything can commit as CONFIRMED. Any
      // failure -- ineligible hub, several hubs without a choice, concurrent
      // suspension -- throws and rolls the claim and capacity back with it, so
      // CONFIRMED always implies a durable, valid decision. Candidates are read
      // FOR SHARE from the Shipment's stored, server-derived geography only.
      await this.writeHubDecision(
        em,
        shipment.id,
        await this.decideHubs(em, shipment, hubInputs),
      );

      const weight = capacityWeightKg(shipment.weightKg);
      if (switchesSlot) {
        // New slot: validated + atomic, fail-closed (throws => rollback).
        const reserveNew = () =>
          this.transportService.reserveSlot(
            dto.availabilityId!,
            weight,
            { providerId, routeId: finalRouteId },
            em,
          );
        // The old slot's reservation (held since creation) is superseded.
        const releaseOld = () =>
          this.transportService.releaseCapacity(shipment.availabilityId!, weight, em);
        // Both are inside one transaction, so their order can't change the
        // outcome -- but two shipments switching slots in opposite directions
        // would take the two slot rows in opposite orders and could deadlock.
        // Always touch the lower slot id first.
        if (shipment.availabilityId && shipment.availabilityId < dto.availabilityId!) {
          await releaseOld();
          await reserveNew();
        } else {
          await reserveNew();
          if (shipment.availabilityId) await releaseOld();
        }
      } else if (shipment.availabilityId) {
        // Slot attached at create: it must still agree with the provider/
        // route being confirmed. No capacity change.
        await this.transportService.assertHeldSlotMatches(
          shipment.availabilityId,
          { providerId, routeId: finalRouteId },
          em,
        );
      }
      return 'won' as const;
    });

    if (outcome === 'lost') {
      const current = await this.shipmentRepo.findOne({ where: { id: shipment.id } });
      if (current?.status === ShipmentStatus.CONFIRMED) {
        return this.completeConfirmedShipment(current, hubInputs);
      }
      this.assertTransition(current?.status ?? shipment.status, ShipmentStatus.CONFIRMED);
    }

    const updated = await this.shipmentRepo.findOne({ where: { id: shipment.id } });
    const parcel = await this.ensureParcelForShipment(updated!);
    return { shipment: updated!, parcel };
  }

  // Idempotent completion for a Shipment that is already CONFIRMED. Never
  // touches capacity and ignores any provider/slot/route in the request (a
  // confirmed Shipment's provider is not editable here). Re-validates the
  // stored provider, failing closed, then reuses or creates exactly one Parcel
  // under UQ_parcel_shipmentId.
  //
  // Hub decision (Stage 2F): the STORED decision always wins.
  //  - decided: a request that would need a different hub is a 409 and is never
  //    applied; omitting hub input is fine;
  //  - undecided (a legacy / old-code CONFIRMED row) and a Parcel already
  //    exists: the Parcel is returned untouched, no decision is invented (a
  //    request to choose a hub now is a 409);
  //  - undecided and no Parcel: the late decision (recordLateHubDecision),
  //    a locked compare-and-set, then the Parcel from that stored decision.
  private async completeConfirmedShipment(
    shipment: Shipment,
    hubInputs: Record<HubSide, HubSelectionInput> = NO_HUB_INPUT,
  ): Promise<{ shipment: Shipment; parcel: Parcel }> {
    if (!shipment.providerId) {
      throw new BadRequestException('Select a provider before confirming');
    }
    await this.transportService.assertEligibleProvider(shipment.providerId);

    let current = shipment;
    const existing = await this.parcelRepo.findOne({
      where: { shipment: { id: shipment.id } },
    });
    if (this.hasHubDecision(current)) {
      assertNoDecisionConflict(current, hubInputs);
    } else if (existing) {
      if (anyHubRequested(hubInputs)) {
        throw decisionConflictError(hubInputs.origin.requested ? 'origin' : 'destination');
      }
    } else {
      current = await this.recordLateHubDecision(shipment.id, hubInputs);
    }
    const parcel = existing ?? (await this.ensureParcelForShipment(current));
    return { shipment: current, parcel };
  }

  private hasHubDecision(s: Pick<Shipment, 'originHubSource'>): boolean {
    return s.originHubSource !== null && s.originHubSource !== undefined;
  }

  private parseHubInputs(dto: ConfirmShipmentDto | undefined): Record<HubSide, HubSelectionInput> {
    const d = dto ?? {};
    return {
      origin: parseHubSelectionInput('origin', d.originHubId, d.requestOriginHub),
      destination: parseHubSelectionInput('destination', d.destinationHubId, d.requestDestinationHub),
    };
  }

  // The ONE decision routine for a Shipment (used by the claim transaction and
  // the late-decision transaction). Must run inside a transaction: candidates
  // are read FOR SHARE. Geography comes ONLY from the Shipment's stored,
  // server-derived snapshot -- never from the request, never from a city
  // string. Origin is decided before destination (deterministic lock order).
  private async decideHubs(
    em: EntityManager,
    shipment: Shipment,
    inputs: Record<HubSide, HubSelectionInput>,
  ): Promise<Record<HubSide, HubDecision>> {
    const decideSide = async (side: HubSide): Promise<HubDecision> => {
      const input = inputs[side];
      if (!input.requested) return decideHubForSide(side, input, null, []);
      const keys = storedSideHubKeys(readStoredSnapshotSide(shipment, side));
      const candidates = await discoverHubCandidates(hubRepoOf(em), keys, true);
      return decideHubForSide(side, input, keys, candidates);
    };
    const origin = await decideSide('origin');
    const destination = await decideSide('destination');
    return { origin, destination };
  }

  // Sanctioned writer #1/#2 of the decision columns: a compare-and-set that
  // only succeeds while BOTH sources are still NULL. Both sides and the
  // timestamp are written together (the migration's CHECK requires it).
  private async writeHubDecision(
    em: EntityManager,
    shipmentId: number,
    decision: Record<HubSide, HubDecision>,
  ): Promise<void> {
    const res = await em.getRepository(Shipment).update(
      { id: shipmentId, originHubSource: IsNull(), destinationHubSource: IsNull() },
      {
        originHubId: decision.origin.hubId,
        originHubSource: decision.origin.source,
        destinationHubId: decision.destination.hubId,
        destinationHubSource: decision.destination.source,
        hubDecidedAt: new Date(),
      },
    );
    if (res?.affected === 0) {
      // Unreachable while the row lock is held; fail closed rather than continue.
      throw new ConflictException('The hub decision for this shipment was already recorded');
    }
  }

  // Late decision for a CONFIRMED row with NO decision and NO Parcel (legacy /
  // old-code rows). Row-locked re-read, so a concurrent late decision, a
  // concurrent claim-transaction or a cancel serialise on the shipment row;
  // whoever finds a decision already stored compares instead of writing. Never
  // infers a hub from a city string; free-text geography has no authority.
  private async recordLateHubDecision(
    shipmentId: number,
    inputs: Record<HubSide, HubSelectionInput>,
  ): Promise<Shipment> {
    return this.shipmentRepo.manager.transaction(async (em) => {
      const shipments = em.getRepository(Shipment);
      const row = await shipments.findOne({
        where: { id: shipmentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) throw new NotFoundException('Shipment not found');
      if (row.status !== ShipmentStatus.CONFIRMED) {
        throw new BadRequestException(`Cannot decide hubs for a shipment that is "${row.status}"`);
      }
      if (this.hasHubDecision(row)) {
        assertNoDecisionConflict(row, inputs);
        return row;
      }
      await this.writeHubDecision(em, row.id, await this.decideHubs(em, row, inputs));
      return (await shipments.findOne({ where: { id: shipmentId } }))!;
    });
  }

  // ── Hub discovery (read-only; never selects, never writes) ───────────────
  // Two doors, ONE policy (hubMatchKeys / discoverHubCandidates):
  //  - shipment-bound: owner-only, from the stored server-derived snapshot --
  //    the same keys the decision uses, so listing and validation cannot drift;
  //  - place preview: an exact, server-re-resolved PlaceRef.
  // Advisory reads: no locks. The decision path re-reads under lock.
  async discoverHubsForShipment(
    userId: number,
    shipmentId: number,
    rawSide: unknown,
  ): Promise<HubDiscoveryResult> {
    const side = parseHubSide(rawSide);
    const shipment = await this.shipmentRepo.findOne({ where: { id: shipmentId } });
    if (!shipment) throw new NotFoundException('Shipment not found');
    if (shipment.requestedByUserId !== userId) throw new ForbiddenException('Not your shipment');
    const stored = readStoredSnapshotSide(shipment, side);
    const keys = storedSideHubKeys(stored);
    const hubs = await discoverHubCandidates(this.superAgentRepo, keys, false);
    const source = side === 'origin' ? shipment.originHubSource : shipment.destinationHubSource;
    return {
      side,
      resolved: keys !== null,
      place: keys ? { label: stored.label } : null,
      matchedOn: { keys: keys ?? [] },
      count: hubs.length,
      hubs,
      decision: source
        ? { source, hubId: (side === 'origin' ? shipment.originHubId : shipment.destinationHubId) ?? null }
        : null,
    };
  }

  async discoverHubsForPlace(
    place: { providerKey: string; providerPlaceId: string },
    rawSide: unknown,
  ): Promise<HubDiscoveryResult> {
    const side = parseHubSide(rawSide);
    const candidate = await this.locationIntelligence.resolve({
      providerKey: place.providerKey,
      providerPlaceId: place.providerPlaceId,
    });
    if (!candidate) throw new BadRequestException(`Unknown ${side} place selection`);
    const keys = storedSideHubKeys({
      regionName: candidate.regionName,
      providerKey: candidate.providerKey,
      resolutionMethod: candidate.resolutionMethod,
    });
    if (!keys) throw new BadRequestException('The selected place has no usable city context');
    const hubs = await discoverHubCandidates(this.superAgentRepo, keys, false);
    return {
      side,
      resolved: true,
      place: { label: candidate.displayLabel ?? null },
      matchedOn: { keys },
      count: hubs.length,
      hubs,
    };
  }

  // Only reachable before physical collection has started — matches
  // TransportAssignment's own cancel-before-departure rule. Releases any
  // capacity this shipment had reserved.
  async cancelShipment(userId: number, shipmentId: number): Promise<Shipment> {
    const preliminary = await this.shipmentRepo.findOne({ where: { id: shipmentId } });
    if (!preliminary) throw new NotFoundException('Shipment not found');
    if (preliminary.requestedByUserId !== userId) {
      throw new ForbiddenException('Not your shipment');
    }

    // Transition + release are ONE transaction on a row-locked re-read, so a
    // concurrent or retried cancel (or a racing confirm) sees the committed
    // state and can never double-release: only the caller that actually moves
    // the shipment to CANCELLED releases its slot, exactly once.
    return this.shipmentRepo.manager.transaction(async (em) => {
      const shipments = em.getRepository(Shipment);
      const shipment = await shipments.findOne({
        where: { id: shipmentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!shipment) throw new NotFoundException('Shipment not found');
      this.assertTransition(shipment.status, ShipmentStatus.CANCELLED);

      if (shipment.availabilityId) {
        await this.transportService.releaseCapacity(
          shipment.availabilityId,
          capacityWeightKg(shipment.weightKg),
          em,
        );
      }
      await shipments.update(shipment.id, { status: ShipmentStatus.CANCELLED });
      return (await shipments.findOne({ where: { id: shipment.id } }))!;
    });
  }

  // Idempotent by construction: a Shipment can only ever have one Parcel
  // (checked by querying for an existing one before creating), so calling
  // this twice — e.g. a retried request — never creates a duplicate.
  // Mirrors OrdersService.superAgentReceiveOrder()'s existing
  // Order -> Parcel creation, just triggered from the Shipment side (hubs
  // aside: see below).
  private async ensureParcelForShipment(shipment: Shipment): Promise<Parcel> {
    const existing = await this.parcelRepo.findOne({
      where: { shipment: { id: shipment.id } },
    });
    if (existing) return existing;

    // Stage 2F: the hubs come ONLY from the Shipment's durable decision. No
    // search, no city match, no fallback and no re-selection -- a retry after
    // a crash reproduces exactly the custody decision that caused the
    // confirmation. A decided hub is referenced by id even if it has since
    // been suspended (substituting another hub would be a different decision);
    // a side decided 'not_required' / 'none_available' has no hub. Reaching
    // this point without a decision is a bug: fail closed.
    if (!this.hasHubDecision(shipment)) {
      throw new Error(`Shipment ${shipment.id} has no recorded hub decision`);
    }
    const originSuperAgent = shipment.originHubId ? ({ id: shipment.originHubId } as SuperAgent) : null;
    const destinationSuperAgent = shipment.destinationHubId
      ? ({ id: shipment.destinationHubId } as SuperAgent)
      : null;

    const created: Parcel = this.parcelRepo.create({
      shipment: { id: shipment.id } as any,
      order: null,
      senderName: shipment.senderName,
      senderPhone: shipment.senderPhone,
      buyerPhone: shipment.receiverPhone,
      recipientName: shipment.receiverName,
      originCity: shipment.originCity,
      destinationCity: shipment.destinationCity,
      weightKg: shipment.weightKg,
      description: shipment.itemDescription,
      estimatedShippingFee: Number(shipment.priceQuoted) || 0,
      superAgent: originSuperAgent || null,
      destinationSuperAgent: destinationSuperAgent || null,
      // A plain descriptive string (not a strict enum on this entity) —
      // distinct from 'seller_shipment' (a seller-initiated sale) and
      // 'online_order', since this parcel came from neither: an
      // independent, non-seller "send something" request.
      source: 'shipment',
      status: ParcelStatus.PENDING,
    });
    // UQ_parcel_shipmentId (Stage 1 integrity migration) is the real
    // authority on "at most one Parcel per Shipment" — the find-then-create
    // check above is only a fast path, not the guarantee. Under a genuine
    // concurrent confirmShipment() race, two requests can both pass that
    // check before either insert commits; exactly one INSERT then wins and
    // the other hits this unique index (23505). Recover deterministically by
    // returning the winner's row instead of surfacing a raw database error.
    //
    // Must recognize THIS specific constraint, not bare 23505 — Parcel has
    // other unique constraints (e.g. trackingNumber) an insert could
    // conceivably violate for an unrelated reason, and blindly recovering
    // via "any Parcel already linked to this shipment" for a violation that
    // has nothing to do with the shipment link would misclassify a real
    // error as a race and silently return the wrong outcome. Mirrors the
    // existing isUniqueViolation(e, constraintName) pattern already used in
    // business-capability-application.service.ts — checked against the
    // error text since not every pg/TypeORM error surfaces a bare
    // `.constraint` property consistently.
    let saved: Parcel;
    try {
      saved = await this.parcelRepo.save(created);
    } catch (err: any) {
      if (this.isParcelShipmentUniqueViolation(err)) {
        const winner = await this.parcelRepo.findOne({
          where: { shipment: { id: shipment.id } },
        });
        if (winner) return winner;
      }
      throw err;
    }
    saved.trackingNumber = `KTX-PCL-${saved.id}`;
    return this.parcelRepo.save(saved);
  }

  private isParcelShipmentUniqueViolation(err: any): boolean {
    const pgCode = err?.code ?? err?.driverError?.code;
    if (pgCode !== '23505') return false;
    const text = String(
      err?.constraint ??
        err?.driverError?.constraint ??
        err?.detail ??
        err?.driverError?.detail ??
        err?.message ??
        '',
    );
    return text.includes('UQ_parcel_shipmentId');
  }
}
