import { BadRequestException, Injectable } from '@nestjs/common';
import { AgentsService } from '../agents/agents.service';
import { TransportService } from './transport.service';
import { JourneyComposerService } from './journey-composer.service';

export interface DiscoverServiceOffersDto {
  fromCity: string; toCity: string; weightKg: number;
  pickup: 'door' | 'point'; delivery: 'door' | 'collect';
  origin?: any; destination?: any;
  providerId?: number;
  discoveryOnly?: boolean;
}
export interface CommitServiceOfferDto extends DiscoverServiceOffersDto { serviceType: 'direct_delivery' | 'composed_intercity'; routeId?: number; runId?: number; paymentMethod?: 'cash' | 'prepaid'; }

export interface LogisticsServiceOffer {
  serviceType: 'direct_delivery' | 'composed_intercity';
  name: string; price: number | null; currency: 'TZS'; etaLabel: string;
  pricingMode?: 'instant' | 'quote_required';
  fulfillmentStatus?: { pickup: 'included' | 'priced' | 'pending'; delivery: 'included' | 'priced' | 'pending' };
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
    // Exact-trip entry remains supported when a caller deliberately chose a
    // concrete TransportRun. Normal Tuma Mzigo commits the route service and
    // lets execution resolve a run later.
    const runId = Number(dto.runId);
    if (Number.isInteger(runId) && runId > 0) {
      // selectComposed performs the authoritative run/status/capacity/route
      // revalidation; service discovery intentionally does not depend on runs.
      return this.journeys.selectComposed(userId, {
        origin: dto.origin, destination: dto.destination,
        originSnapshot: dto.origin ? undefined : { city: dto.fromCity },
        destinationSnapshot: dto.destination ? undefined : { city: dto.toCity },
        cargoRequirements: { weightKg: dto.weightKg },
        paymentMethod: dto.paymentMethod, runId,
      } as any);
    }

    const routeId = Number(dto.routeId);
    const providerId = Number(dto.providerId);
    const chosen = offers.find(o => {
      const option: any = o.fulfillment.transportOption;
      return o.serviceType === 'composed_intercity' &&
        Number(option?.routeId) === routeId && Number(option?.providerId) === providerId;
    });
    if (!chosen) throw new BadRequestException('That shipping service is no longer available; choose a fresh offer');
    return this.journeys.selectService(userId, {
      origin: dto.origin, destination: dto.destination,
      originSnapshot: dto.origin ? undefined : { city: dto.fromCity },
      destinationSnapshot: dto.destination ? undefined : { city: dto.toCity },
      cargoRequirements: { weightKg: dto.weightKg },
      paymentMethod: dto.paymentMethod, providerId, routeId,
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
    // Route coverage and first/last-mile Agent supply are separate facts.
    // Never make a valid linehaul service disappear merely because Agent
    // pricing/supply has not been configured yet. The offer reports the
    // unresolved door component explicitly so the UI cannot pretend the
    // linehaul fare is an all-in Door-to-Door total.

    const pickupAgent: any = originAgents[0]; const deliveryAgent: any = destinationAgents[0];
    const pickupFee = dto.pickup === 'door' && pickupAgent ? Number(pickupAgent.collectionFeeUrban ?? pickupAgent.deliveryFee ?? 0) : 0;
    const deliveryFee = dto.delivery === 'door' && deliveryAgent ? Number(deliveryAgent.deliveryFee ?? 0) : 0;

    if (sameCity) {
      const directAgent: any = dto.pickup === 'door' ? pickupAgent : deliveryAgent;
      if (!directAgent) return [];
      return [{
        serviceType: 'direct_delivery', name: 'Direct Delivery', price: Math.max(pickupFee, deliveryFee), currency: 'TZS',
        etaLabel: directAgent.deliveryTime ?? 'Same day',
        firstAction: dto.pickup === 'door' && originAgents.length > 0
          ? { type: 'offer_pickup_task', actorCapability: 'local_agent', candidateAgentIds: originAgents.map((a: any) => a.id) }
          : { type: 'customer_dropoff', actorCapability: 'kentexa_point' },
        fulfillment: { pickup: dto.pickup === 'door' ? 'agent' : 'customer_dropoff', linehaul: 'none', delivery: dto.delivery === 'door' ? 'agent' : 'customer_collect' },
      }];
    }

    const services = await this.transport.discoverServiceRoutes(from, to, weight, dto.providerId);
    const offers: LogisticsServiceOffer[] = [];
    for (const service of services.slice(0, 8)) {
      const linehaul = Math.max(Number(service.pricePerKg) * weight, Number(service.fixedFee) || 0);
      const hasInstantPrice = linehaul > 0;
      offers.push({
        serviceType: 'composed_intercity',
        name: service.providerName ? `${service.providerName} Delivery` : 'Kentexa Standard',
        price: hasInstantPrice ? linehaul + pickupFee + deliveryFee : null,
        pricingMode: hasInstantPrice ? 'instant' : 'quote_required',
        currency: 'TZS',
        fulfillmentStatus: {
          pickup: dto.pickup === 'door' ? (pickupAgent ? 'priced' : 'pending') : 'included',
          delivery: dto.delivery === 'door' ? (deliveryAgent ? 'priced' : 'pending') : 'included',
        },
        etaLabel: service.estimatedHours ? `About ${service.estimatedHours} hours linehaul` : 'Scheduled service',
        firstAction: dto.pickup === 'door'
          ? { type: 'offer_pickup_task', actorCapability: 'local_agent', candidateAgentIds: originAgents.map((a: any) => a.id) }
          : { type: 'customer_dropoff', actorCapability: 'kentexa_point' },
        fulfillment: {
          pickup: dto.pickup === 'door' ? 'agent' : 'customer_dropoff',
          linehaul: 'transport_provider',
          delivery: dto.delivery === 'door' ? 'agent' : 'customer_collect',
          transportOption: { ...service, commitmentLevel: 'service_confirmed', runId: null },
        },
      });
    }
    // Instant-price services rank first by price. Quote-required providers
    // remain visible instead of disappearing merely because pricing has not
    // been configured yet.
    return offers.sort((a, b) => {
      if (a.price == null && b.price == null) return a.name.localeCompare(b.name);
      if (a.price == null) return 1;
      if (b.price == null) return -1;
      return a.price - b.price;
    });
  }
}
