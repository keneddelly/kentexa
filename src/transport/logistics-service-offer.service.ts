import { BadRequestException, Injectable } from '@nestjs/common';
import { AgentsService } from '../agents/agents.service';
import { TransportService } from './transport.service';
import { JourneyComposerService } from './journey-composer.service';

export interface DiscoverServiceOffersDto {
  fromCity: string; toCity: string; weightKg: number;
  pickup: 'door' | 'point'; delivery: 'door' | 'collect';
  origin?: any; destination?: any;
}
export interface CommitServiceOfferDto extends DiscoverServiceOffersDto { serviceType: 'direct_delivery' | 'composed_intercity'; runId?: number; paymentMethod?: 'cash' | 'prepaid'; }

export interface LogisticsServiceOffer {
  serviceType: 'direct_delivery' | 'composed_intercity';
  name: string; price: number; currency: 'TZS'; etaLabel: string;
  firstAction: { type: 'offer_pickup_task' | 'customer_dropoff'; actorCapability: 'local_agent' | 'kentexa_point'; candidateAgentIds?: number[] };
  fulfillment: { pickup: 'agent' | 'customer_dropoff'; linehaul: 'none' | 'transport_provider'; delivery: 'agent' | 'customer_collect'; transportOption?: any };
}

@Injectable()
export class LogisticsServiceOfferService {
  constructor(private readonly agents: AgentsService, private readonly transport: TransportService, private readonly journeys: JourneyComposerService) {}

  async commit(userId: number, dto: CommitServiceOfferDto) {
    // Re-discover immediately: the client cannot commit a stale/fabricated service.
    const offers = await this.discover(dto);
    if (dto.serviceType === 'direct_delivery') {
      if (!offers.some(o => o.serviceType === 'direct_delivery')) throw new BadRequestException('Direct delivery is no longer fulfillable');
      return this.journeys.selectDirectDelivery(userId, {
        origin: dto.origin, destination: dto.destination,
        originSnapshot: dto.origin ? undefined : { city: dto.fromCity },
        destinationSnapshot: dto.destination ? undefined : { city: dto.toCity },
        cargoRequirements: { weightKg: dto.weightKg },
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
      cargoRequirements: { weightKg: dto.weightKg },
      paymentMethod: dto.paymentMethod, runId,
    } as any);
  }

  async discover(dto: DiscoverServiceOffersDto): Promise<LogisticsServiceOffer[]> {
    const from = dto?.fromCity?.trim(); const to = dto?.toCity?.trim(); const weight = Number(dto?.weightKg);
    if (!from || !to || !Number.isFinite(weight) || weight <= 0) throw new BadRequestException('fromCity, toCity and a positive weightKg are required');
    if (!['door', 'point'].includes(dto.pickup) || !['door', 'collect'].includes(dto.delivery)) throw new BadRequestException('Invalid pickup or delivery outcome');

    const sameCity = from.toLocaleLowerCase('en') === to.toLocaleLowerCase('en');
    const [originAgents, destinationAgents] = await Promise.all([
      dto.pickup === 'door' ? this.agents.getAvailableAgents(from, weight) : Promise.resolve([]),
      dto.delivery === 'door' ? this.agents.getAvailableAgents(to, weight) : Promise.resolve([]),
    ]);
    if (dto.pickup === 'door' && originAgents.length === 0) return [];
    if (dto.delivery === 'door' && destinationAgents.length === 0) return [];

    const pickupAgent: any = originAgents[0]; const deliveryAgent: any = destinationAgents[0];
    const pickupFee = dto.pickup === 'door' ? Number(pickupAgent.collectionFeeUrban ?? pickupAgent.deliveryFee ?? 0) : 0;
    const deliveryFee = dto.delivery === 'door' ? Number(deliveryAgent.deliveryFee ?? 0) : 0;

    if (sameCity) {
      const directAgent: any = dto.pickup === 'door' ? pickupAgent : deliveryAgent;
      if (!directAgent) return [];
      return [{
        serviceType: 'direct_delivery', name: 'Direct Delivery', price: Math.max(pickupFee, deliveryFee), currency: 'TZS',
        etaLabel: directAgent.deliveryTime ?? 'Same day',
        firstAction: dto.pickup === 'door'
          ? { type: 'offer_pickup_task', actorCapability: 'local_agent', candidateAgentIds: originAgents.map((a: any) => a.id) }
          : { type: 'customer_dropoff', actorCapability: 'kentexa_point' },
        fulfillment: { pickup: dto.pickup === 'door' ? 'agent' : 'customer_dropoff', linehaul: 'none', delivery: dto.delivery === 'door' ? 'agent' : 'customer_collect' },
      }];
    }

    const availability = await this.transport.findPublicAvailabilityForRoute(from, to, weight);
    const trips: any[] = availability.trips || [];
    const offers: LogisticsServiceOffer[] = [];
    for (const trip of trips.slice(0, 5)) {
      const perKg = Number(trip.pricePerKg) || 0; const fixed = Number(trip.fixedFee) || 0;
      const linehaul = Math.max(perKg * weight, fixed); if (!linehaul) continue;
      offers.push({
        serviceType: 'composed_intercity', name: trip.providerName ? `${trip.providerName} Delivery` : 'Kentexa Standard',
        price: linehaul + pickupFee + deliveryFee, currency: 'TZS',
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
