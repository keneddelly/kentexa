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
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { capacityWeightKg } from '../transport/slot-capacity';
import { Shipment, ShipmentStatus, ShipmentHandoffOption } from './entities/shipment.entity';
import { TransportRoute } from '../transport/entities/transport-route.entity';
import { TransportService } from '../transport/transport.service';
import { TzLocationService } from '../tz-location/tz-location.service';
import { Parcel, ParcelStatus } from '../super-agents/entities/parcel.entity';
import { SuperAgent, SuperAgentStatus } from '../super-agents/entities/super-agent.entity';
import {
  ShipmentLocationInput,
  buildLocationSnapshot,
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

export interface CreateShipmentDto {
  senderName?: string;
  senderPhone?: string;
  receiverName: string;
  receiverPhone: string;
  originCity: string;
  originWard?: string;
  // Set when the frontend's location picker resolved a real tz-location
  // suggestion (the user actually SELECTED a place, not just typed text) —
  // when present, this is authoritative and skips the fuzzy server-side
  // re-resolution below entirely.
  originRegionId?: number;
  originWardId?: number;
  destinationCity: string;
  destinationWard?: string;
  destinationRegionId?: number;
  destinationWardId?: number;
  // Optional by-value snapshot of the place the user actually SELECTED (a
  // subset of Stage 2A's LocationCandidate). Captured once here and never
  // rewritten; absent for free-text shipments, which simply store none.
  // UNTRUSTED, client-asserted historical input: coordinates, providerKey
  // and resolutionMethod are recorded as the user submitted them, not
  // verified by the server or by any provider. Never treat as verified truth.
  originLocation?: ShipmentLocationInput;
  destinationLocation?: ShipmentLocationInput;
  itemDescription: string;
  weightKg?: number;
  routeId?: number;
  availabilityId?: number;
  providerId?: number;
  pickupOption?: ShipmentHandoffOption;
  deliveryOption?: ShipmentHandoffOption;
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
  ) {}

  private async resolveRegionId(city: string | null | undefined): Promise<number | null> {
    if (!city?.trim()) return null;
    try {
      const results = await this.tzLocation.search(city.trim());
      return results?.[0]?.regionId ?? null;
    } catch {
      return null;
    }
  }

  // Real available trips + verified providers for a city pair — reuses
  // TransportService.findAvailableForRoute() rather than re-querying, so
  // this can never drift from what super-agent dispatch already sees.
  // weightKg, when given, hard-excludes anything that can't structurally
  // carry it (see findAvailableForRoute's own doc comment) — a 20ft
  // container search should never surface a boda or courier.
  async findAvailableRoutes(origin: string, destination: string, weightKg = 0) {
    if (!origin?.trim() || !destination?.trim()) {
      throw new BadRequestException('Origin and destination are required');
    }
    const { published, providers } = await this.transportService.findAvailableForRoute(
      origin.trim(),
      destination.trim(),
      weightKg,
    );
    return {
      availableTrips: published.map((a) => ({
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
      })),
      providers: providers.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        logoUrl: p.logoUrl,
        rating: Number(p.rating) || 0,
        whatsappPhone: p.whatsappPhone,
        contactPhone: p.contactPhone,
      })),
    };
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
    if (!dto.originCity?.trim() || !dto.destinationCity?.trim()) {
      throw new BadRequestException('Origin and destination are required');
    }
    if (!dto.itemDescription?.trim()) {
      throw new BadRequestException('Describe what you are sending');
    }

    // Prefer what the user actually SELECTED from the location engine over
    // guessing again from the typed city string — only fall back to the
    // fuzzy search when the frontend didn't resolve a suggestion (e.g. the
    // user typed a city and never picked from the dropdown).
    const [originRegionId, destinationRegionId] = await Promise.all([
      dto.originRegionId ?? this.resolveRegionId(dto.originCity),
      dto.destinationRegionId ?? this.resolveRegionId(dto.destinationCity),
    ]);

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
          originCity: dto.originCity.trim(),
          originRegionId,
          originWard: dto.originWard?.trim() || null,
          originWardId: dto.originWardId || null,
          destinationCity: dto.destinationCity.trim(),
          destinationRegionId,
          destinationWard: dto.destinationWard?.trim() || null,
          destinationWardId: dto.destinationWardId || null,
          ...toOriginSnapshotColumns(buildLocationSnapshot(dto.originLocation)),
          ...toDestinationSnapshotColumns(buildLocationSnapshot(dto.destinationLocation)),
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
    dto: { providerId?: number; availabilityId?: number; routeId?: number },
  ): Promise<{ shipment: Shipment; parcel: Parcel }> {
    const shipment = await this.shipmentRepo.findOne({ where: { id: shipmentId } });
    if (!shipment) throw new NotFoundException('Shipment not found');
    if (shipment.requestedByUserId !== userId) {
      throw new ForbiddenException('Not your shipment');
    }

    if (shipment.status === ShipmentStatus.CONFIRMED) {
      return this.completeConfirmedShipment(shipment);
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
        return this.completeConfirmedShipment(current);
      }
      this.assertTransition(current?.status ?? shipment.status, ShipmentStatus.CONFIRMED);
    }

    const updated = await this.shipmentRepo.findOne({ where: { id: shipment.id } });
    const parcel = await this.ensureParcelForShipment(updated!);
    return { shipment: updated!, parcel };
  }

  // Idempotent completion for a Shipment that is already CONFIRMED. Never
  // writes the Shipment or touches capacity and ignores any provider/slot/
  // route in the request (a confirmed Shipment's provider is not editable
  // here). Re-validates the stored provider, failing closed, then reuses or
  // creates exactly one Parcel under UQ_parcel_shipmentId.
  private async completeConfirmedShipment(
    shipment: Shipment,
  ): Promise<{ shipment: Shipment; parcel: Parcel }> {
    if (!shipment.providerId) {
      throw new BadRequestException('Select a provider before confirming');
    }
    await this.transportService.assertEligibleProvider(shipment.providerId);
    const parcel = await this.ensureParcelForShipment(shipment);
    return { shipment, parcel };
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
  // Order -> Parcel creation exactly, just triggered from the Shipment side.
  private async ensureParcelForShipment(shipment: Shipment): Promise<Parcel> {
    const existing = await this.parcelRepo.findOne({
      where: { shipment: { id: shipment.id } },
    });
    if (existing) return existing;

    // Best-effort hub match by city — same convention OrdersService.create()
    // already uses. No active hub on a route is a valid, common state (not
    // every city has a Super Agent yet); the Parcel is still created with
    // a null hub rather than blocking the shipment.
    const [originSuperAgent, destinationSuperAgent] = await Promise.all([
      this.superAgentRepo.findOne({
        where: { city: shipment.originCity, status: SuperAgentStatus.ACTIVE },
      }),
      this.superAgentRepo.findOne({
        where: { city: shipment.destinationCity, status: SuperAgentStatus.ACTIVE },
      }),
    ]);

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
