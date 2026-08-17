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
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shipment, ShipmentStatus, ShipmentHandoffOption } from './entities/shipment.entity';
import { TransportRoute } from '../transport/entities/transport-route.entity';
import { TransportService } from '../transport/transport.service';
import { TzLocationService } from '../tz-location/tz-location.service';

export interface CreateShipmentDto {
  senderName?: string;
  senderPhone?: string;
  receiverName: string;
  receiverPhone: string;
  originCity: string;
  originWard?: string;
  destinationCity: string;
  destinationWard?: string;
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
  constructor(
    @InjectRepository(Shipment) private shipmentRepo: Repository<Shipment>,
    @InjectRepository(TransportRoute) private routeRepo: Repository<TransportRoute>,
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
  async findAvailableRoutes(origin: string, destination: string) {
    if (!origin?.trim() || !destination?.trim()) {
      throw new BadRequestException('Origin and destination are required');
    }
    const { published, providers } = await this.transportService.findAvailableForRoute(
      origin.trim(),
      destination.trim(),
    );
    return {
      availableTrips: published.map((a) => ({
        availabilityId: a.id,
        providerId: a.providerId,
        providerName: (a as any).provider?.name ?? null,
        providerLogo: (a as any).provider?.logoUrl ?? null,
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

    const [originRegionId, destinationRegionId] = await Promise.all([
      this.resolveRegionId(dto.originCity),
      this.resolveRegionId(dto.destinationCity),
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
        destinationCity: dto.destinationCity.trim(),
        destinationRegionId,
        destinationWard: dto.destinationWard?.trim() || null,
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

  async trackShipment(trackingNumber: string): Promise<Shipment> {
    const s = await this.shipmentRepo.findOne({ where: { trackingNumber } });
    if (!s) throw new NotFoundException('Shipment not found');
    return s;
  }
}
