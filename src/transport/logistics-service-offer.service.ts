import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentsService } from '../agents/agents.service';
import { TransportService } from './transport.service';
import { JourneyComposerService } from './journey-composer.service';
import { LogisticsAgentPricing, ParcelSizeClass } from './entities/logistics-agent-pricing.entity';

export interface DiscoverServiceOffersDto {
  fromCity: string; toCity: string;
  parcelSize: ParcelSizeClass;
  weightKg?: number;
  pickup: 'door' | 'point'; delivery: 'door' | 'collect';
  origin?: any; destination?: any;
}
export interface CommitServiceOfferDto extends DiscoverServiceOffersDto {
  serviceType: 'direct_delivery' | 'composed_intercity';
  runId?: number; paymentMethod?: 'cash' | 'prepaid';
}

export interface LogisticsServiceOffer {
  serviceType: 'direct_delivery' | 'composed_intercity';
  name: string; price: number; currency: 'TZS'; etaLabel: string;
  parcelSize: ParcelSizeClass;
  priceBreakdown: { pickup: number; transport: number; delivery: number };
  firstAction: { type: 'offer_pickup_task' | 'customer_dropoff'; actorCapability: 'local_agent' | 'kentexa_point'; candidateAgentIds?: number[] };
  fulfillment: { pickup: 'agent' | 'customer_dropoff'; linehaul: 'none' | 'transport_provider'; delivery: 'agent' | 'customer_collect'; transportOption?: any };
}

const CAPACITY_WEIGHT: Record<ParcelSizeClass, number> = {
  [ParcelSizeClass.SMALL]: 5,
  [ParcelSizeClass.STANDARD]: 25,
  [ParcelSizeClass.LARGE]: 150,
  [ParcelSizeClass.SPECIAL]: 0,
};

@Injectable()
export class LogisticsServiceOfferService {
  constructor(
    private readonly agents: AgentsService,
    private readonly transport: TransportService,
    private readonly journeys: JourneyComposerService,
    @InjectRepository(LogisticsAgentPricing) private readonly pricingRepo: Repository<LogisticsAgentPricing>,
  ) {}

  async getAdminPricing() {
    return this.pricingRepo.find({ order: { sizeClass: 'ASC' } });
  }

  async setAdminPricing(sizeClass: ParcelSizeClass, dto: { pickupFee?: number | null; deliveryFee?: number | null; requiresManualQuote?: boolean }) {
    if (!Object.values(ParcelSizeClass).includes(sizeClass)) throw new BadRequestException('Invalid parcel size');
    const row = await this.pricingRepo.findOne({ where: { sizeClass } }) ?? this.pricingRepo.create({ sizeClass });
    for (const key of ['pickupFee', 'deliveryFee'] as const) {
      if (dto[key] !== undefined && dto[key] !== null) {
        const n = Number(dto[key]); if (!Number.isFinite(n) || n < 0) throw new BadRequestException(`${key} must be non-negative`);
        row[key] = n;
      } else if (dto[key] === null) row[key] = null;
    }
    if (dto.requiresManualQuote !== undefined) row.requiresManualQuote = !!dto.requiresManualQuote;
    return this.pricingRepo.save(row);
  }

  private async pricingFor(sizeClass: ParcelSizeClass) {
    return this.pricingRepo.findOne({ where: { sizeClass } });
  }

  private routePrice(trip: any, size: ParcelSizeClass, measuredWeight?: number): number {
    const bySize: Record<ParcelSizeClass, any> = {
      [ParcelSizeClass.SMALL]: trip.priceSmall,
      [ParcelSizeClass.STANDARD]: trip.priceStandard,
      [ParcelSizeClass.LARGE]: trip.priceLarge,
      [ParcelSizeClass.SPECIAL]: trip.priceSpecial,
    };
    const configured = Number(bySize[size]);
    if (Number.isFinite(configured) && configured > 0) return configured;
    // Compatibility for existing measured routes while providers migrate to
    // human-size prices. New customer UX never has to know kilograms.
    if (measuredWeight && measuredWeight > 0) {
      const perKg = Number(trip.pricePerKg) || 0; const fixed = Number(trip.fixedFee) || 0;
      return Math.max(perKg * measuredWeight, fixed);
    }
    return 0;
  }

  async commit(userId: number, dto: CommitServiceOfferDto) {
    const offers = await this.discover(dto);
    const weight = Number(dto.weightKg) > 0 ? Number(dto.weightKg) : CAPACITY_WEIGHT[dto.parcelSize];
    if (dto.serviceType === 'direct_delivery') {
      if (!offers.some(o => o.serviceType === 'direct_delivery')) throw new BadRequestException('Direct delivery is no longer fulfillable');
      return this.journeys.selectDirectDelivery(userId, {
        origin: dto.origin, destination: dto.destination,
        originSnapshot: dto.origin ? undefined : { city: dto.fromCity },
        destinationSnapshot: dto.destination ? undefined : { city: dto.toCity },
        cargoRequirements: { weightKg: weight, parcelSize: dto.parcelSize },
        paymentMethod: dto.paymentMethod,
      } as any);
    }
    const runId = Number(dto.runId);
    const chosen = offers.find(o => o.serviceType === 'composed_intercity' && Number((o.fulfillment.transportOption as any)?.runId) === runId);
    if (!chosen) throw new BadRequestException('That shipping service is no longer available; choose a fresh offer');
    return this.journeys.selectComposed(userId, {
      origin: dto.origin, destination: dto.destination,
      originSnapshot: dto.origin ? undefined : { city: dto.fromCity },
      destinationSnapshot: dto.destination ? undefined : { city: dto.toCity },
      cargoRequirements: { weightKg: weight, parcelSize: dto.parcelSize },
      paymentMethod: dto.paymentMethod, runId,
    } as any);
  }

  async discover(dto: DiscoverServiceOffersDto): Promise<LogisticsServiceOffer[]> {
    const from = dto?.fromCity?.trim(); const to = dto?.toCity?.trim();
    const size = dto?.parcelSize;
    if (!from || !to || !Object.values(ParcelSizeClass).includes(size)) throw new BadRequestException('fromCity, toCity and parcelSize are required');
    if (!['door', 'point'].includes(dto.pickup) || !['door', 'collect'].includes(dto.delivery)) throw new BadRequestException('Invalid pickup or delivery outcome');

    const policy = await this.pricingFor(size);
    // SPECIAL is intentionally not auto-priced unless Admin explicitly enables
    // it and providers publish a compatible special-cargo route price.
    if (!policy || policy.requiresManualQuote) return [];
    const weight = Number(dto.weightKg) > 0 ? Number(dto.weightKg) : CAPACITY_WEIGHT[size];
    const pickupFee = dto.pickup === 'door' ? Number(policy.pickupFee) : 0;
    const deliveryFee = dto.delivery === 'door' ? Number(policy.deliveryFee) : 0;
    if ((dto.pickup === 'door' && !Number.isFinite(pickupFee)) || (dto.delivery === 'door' && !Number.isFinite(deliveryFee))) return [];

    const sameCity = from.toLocaleLowerCase('en') === to.toLocaleLowerCase('en');
    const [originAgents, destinationAgents] = await Promise.all([
      dto.pickup === 'door' ? this.agents.getAvailableAgents(from, weight) : Promise.resolve([]),
      dto.delivery === 'door' ? this.agents.getAvailableAgents(to, weight) : Promise.resolve([]),
    ]);
    if (dto.pickup === 'door' && originAgents.length === 0) return [];
    if (dto.delivery === 'door' && destinationAgents.length === 0) return [];

    if (sameCity) {
      const directAgent: any = dto.pickup === 'door' ? originAgents[0] : destinationAgents[0];
      if (!directAgent) return [];
      const localPrice = Math.max(pickupFee || 0, deliveryFee || 0);
      if (localPrice <= 0) return [];
      return [{
        serviceType: 'direct_delivery', name: 'Kentexa Local Delivery', price: localPrice, currency: 'TZS', parcelSize: size,
        priceBreakdown: { pickup: dto.pickup === 'door' ? localPrice : 0, transport: 0, delivery: dto.pickup === 'door' ? 0 : localPrice },
        etaLabel: directAgent.deliveryTime ?? 'Same day',
        firstAction: dto.pickup === 'door'
          ? { type: 'offer_pickup_task', actorCapability: 'local_agent', candidateAgentIds: originAgents.map((a: any) => a.id) }
          : { type: 'customer_dropoff', actorCapability: 'kentexa_point' },
        fulfillment: { pickup: dto.pickup === 'door' ? 'agent' : 'customer_dropoff', linehaul: 'none', delivery: dto.delivery === 'door' ? 'agent' : 'customer_collect' },
      }];
    }

    const availability = await this.transport.findPublicAvailabilityForRoute(from, to, weight);
    const offers: LogisticsServiceOffer[] = [];
    for (const trip of (availability.trips || []).slice(0, 5)) {
      const linehaul = this.routePrice(trip, size, Number(dto.weightKg) > 0 ? Number(dto.weightKg) : undefined);
      if (linehaul <= 0) continue; // no provider price => not bookable
      offers.push({
        serviceType: 'composed_intercity', name: trip.providerName ? `${trip.providerName} Delivery` : 'Kentexa Standard',
        price: linehaul + pickupFee + deliveryFee, currency: 'TZS', parcelSize: size,
        priceBreakdown: { pickup: pickupFee, transport: linehaul, delivery: deliveryFee },
        etaLabel: trip.departureTime ? `Departs ${trip.departureTime}` : 'Scheduled service',
        firstAction: dto.pickup === 'door'
          ? { type: 'offer_pickup_task', actorCapability: 'local_agent', candidateAgentIds: originAgents.map((a: any) => a.id) }
          : { type: 'customer_dropoff', actorCapability: 'kentexa_point' },
        fulfillment: { pickup: dto.pickup === 'door' ? 'agent' : 'customer_dropoff', linehaul: 'transport_provider', delivery: dto.delivery === 'door' ? 'agent' : 'customer_collect', transportOption: trip },
      });
    }
    return offers.sort((a, b) => a.price - b.price);
  }
}
