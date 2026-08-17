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
import { Shipment, ShipmentStatus, ShipmentHandoffOption } from './entities/shipment.entity';
import { TransportRoute } from '../transport/entities/transport-route.entity';
import { TransportService } from '../transport/transport.service';
import { TzLocationService } from '../tz-location/tz-location.service';
import { Parcel, ParcelStatus } from '../super-agents/entities/parcel.entity';
import { SuperAgent, SuperAgentStatus } from '../super-agents/entities/super-agent.entity';

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

    let priceQuoted: number | null = null;
    if (dto.routeId) {
      priceQuoted = await this.estimateShipmentPrice(dto.routeId, dto.weightKg || 0);
    }

    // A shipment against a chosen slot is real demand against it, whether
    // or not a formal TransportAssignment gets created later by a provider/
    // super-agent dispatching it — same accounting createAssignment does.
    if (dto.availabilityId) {
      await this.transportService.reserveCapacity(dto.availabilityId, dto.weightKg || 0);
    }

    const saved = await this.shipmentRepo.save(
      this.shipmentRepo.create({
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
        itemDescription: dto.itemDescription.trim(),
        weightKg: dto.weightKg || 0,
        routeId: dto.routeId || null,
        availabilityId: dto.availabilityId || null,
        providerId: dto.providerId || null,
        pickupOption: dto.pickupOption || ShipmentHandoffOption.AGENT,
        deliveryOption: dto.deliveryOption || ShipmentHandoffOption.AGENT,
        priceQuoted,
        status: dto.providerId ? ShipmentStatus.CONFIRMED : ShipmentStatus.PENDING,
      }),
    );

    // KTX-SHP-{id} — same "id-derived, set once, never regenerated"
    // convention already used for orders (KTX-ORD-{id}).
    saved.trackingNumber = `KTX-SHP-${saved.id}`;
    return this.shipmentRepo.save(saved);
  }

  async getMyShipments(userId: number): Promise<Shipment[]> {
    return this.shipmentRepo.find({
      where: { requestedByUserId: userId },
      order: { createdAt: 'DESC' },
    });
  }

  async trackShipment(trackingNumber: string) {
    const s = await this.shipmentRepo.findOne({ where: { trackingNumber } });
    if (!s) throw new NotFoundException('Shipment not found');
    // Once a Parcel exists, point the caller at it — TrackParcel.js re-fetches
    // /super-agents/track/:parcelTrackingNumber for the same rich tracking
    // view an Order-based delivery already gets, rather than this module
    // rebuilding that shape itself.
    const parcel = await this.parcelRepo.findOne({
      where: { shipment: { id: s.id } },
    });
    return { ...s, parcelTrackingNumber: parcel?.trackingNumber || null };
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

  // Marks a Shipment as matched to a provider/slot and — this is the point
  // it actually enters Kentexa's logistics network — creates (or reuses)
  // its Parcel. Requester-initiated (picking a provider they liked) or
  // staff-initiated; either way the shipment's own owner check happens here.
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
    this.assertTransition(shipment.status, ShipmentStatus.CONFIRMED);

    const providerId = dto.providerId ?? shipment.providerId;
    if (!providerId) {
      throw new BadRequestException('Select a provider before confirming');
    }

    const updates: Partial<Shipment> = {
      status: ShipmentStatus.CONFIRMED,
      providerId,
    };
    if (dto.availabilityId && dto.availabilityId !== shipment.availabilityId) {
      await this.transportService.reserveCapacity(
        dto.availabilityId,
        Number(shipment.weightKg) || 1,
      );
      updates.availabilityId = dto.availabilityId;
    }
    if (dto.routeId) updates.routeId = dto.routeId;

    await this.shipmentRepo.update(shipment.id, updates);
    const updated = await this.shipmentRepo.findOne({ where: { id: shipment.id } });

    const parcel = await this.ensureParcelForShipment(updated!);
    return { shipment: updated!, parcel };
  }

  // Only reachable before physical collection has started — matches
  // TransportAssignment's own cancel-before-departure rule. Releases any
  // capacity this shipment had reserved.
  async cancelShipment(userId: number, shipmentId: number): Promise<Shipment> {
    const shipment = await this.shipmentRepo.findOne({ where: { id: shipmentId } });
    if (!shipment) throw new NotFoundException('Shipment not found');
    if (shipment.requestedByUserId !== userId) {
      throw new ForbiddenException('Not your shipment');
    }
    this.assertTransition(shipment.status, ShipmentStatus.CANCELLED);

    if (shipment.availabilityId) {
      await this.transportService.releaseCapacity(
        shipment.availabilityId,
        Number(shipment.weightKg) || 1,
      );
    }
    await this.shipmentRepo.update(shipment.id, { status: ShipmentStatus.CANCELLED });
    return (await this.shipmentRepo.findOne({ where: { id: shipment.id } }))!;
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
    const saved = await this.parcelRepo.save(created);
    saved.trackingNumber = `KTX-PCL-${saved.id}`;
    return this.parcelRepo.save(saved);
  }
}
