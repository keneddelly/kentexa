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
export interface CommitServiceOfferDto extends DiscoverServiceOffersDto { serviceType: 'direct_delivery' | 'composed_intercity'; routeId?: number; runId?: number; paymentMethod?: 'cash' | 'prepaid'; cargoRequirements?: any; }

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
        cargoRequirements: dto.cargoRequirements ?? { weightKg: dto.weightKg },
        paymentMethod: dto.paymentMethod,
      } as any);
    }
    const providerId = Number(dto.providerId);
    const routeId = Number(dto.routeId);
    if (!Number.isInteger(providerId) || providerId <= 0 ||
        !Number.isInteger(routeId) || routeId <= 0) {
      throw new BadRequestException('A valid transport provider and route are required');
    }

    const chosen = offers.find(o => {
      const option: any = o.fulfillment.transportOption;
      return o.serviceType === 'composed_intercity' &&
        Number(option?.providerId) === providerId &&
        Number(option?.routeId) === routeId;
    });
    if (!chosen) {
      throw new BadRequestException('That shipping service is no longer available; choose a fresh offer');
    }

    // A Run is optional at customer commitment. If a fresh bookable Run is
    // available, bind it now so the Shipment enters the transporter's
    // manifest and the Run's Super Agent stop relationship immediately.
    // If no Run exists yet, keep the route service confirmed; execution must
    // resolve a real Run before linehaul starts.
    const selectedRunId = Number(dto.runId);
    const option: any = chosen.fulfillment.transportOption;
    const runId = Number.isInteger(selectedRunId) && selectedRunId > 0
      ? selectedRunId
      : (Number.isInteger(Number(option?.runId)) && Number(option?.runId) > 0
        ? Number(option.runId)
        : undefined);

    return this.journeys.selectService(userId, {
      origin: dto.origin, destination: dto.destination,
      originSnapshot: dto.origin ? undefined : { city: dto.fromCity },
      destinationSnapshot: dto.destination ? undefined : { city: dto.toCity },
      cargoRequirements: dto.cargoRequirements ?? { weightKg: dto.weightKg },
      paymentMethod: dto.paymentMethod,
      providerId,
      routeId,
      runId,
      pickup: dto.pickup,
      delivery: dto.delivery,
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

    // Customer discovery is route-first. A TransportRoute is the service
    // coverage authority; an open TransportRun is optional execution supply.
    // When a Run exists, attach it so the Shipment can immediately enter the
    // transporter's manifest and the Run's Super Agent load/unload hubs.
    // When no Run exists, the valid route remains visible and execution can
    // resolve a Run later.
    const [services, supply] = await Promise.all([
      this.transport.discoverServiceRoutes(
        from,
        to,
        weight,
        dto.providerId ? Number(dto.providerId) : undefined,
      ),
      this.transport.discoverSupply(from, to, weight, {
        providerId: dto.providerId ? Number(dto.providerId) : undefined,
      }),
    ]);
    const tripsByRoute = new Map<string, any>();
    for (const trip of supply.trips) {
      const key = `${Number(trip.providerId)}:${Number(trip.routeId)}`;
      const existing = tripsByRoute.get(key);
      if (!existing || new Date(trip.departureAt).getTime() < new Date(existing.departureAt).getTime()) {
        tripsByRoute.set(key, trip);
      }
    }

    const offers: LogisticsServiceOffer[] = [];
    for (const service of services.slice(0, 8)) {
      const key = `${Number(service.providerId)}:${Number(service.routeId)}`;
      const trip = tripsByRoute.get(key);
      const linehaul = Math.max(Number(service.pricePerKg) * weight, Number(service.fixedFee) || 0);
      const hasInstantPrice = linehaul > 0;
      const pickupReady = dto.pickup !== 'door' || originAgents.length > 0;
      const deliveryReady = dto.delivery !== 'door' || destinationAgents.length > 0;
      const option: any = {
        ...service,
        ...(trip ? {
          runId: trip.runId,
          date: trip.date,
          departureTime: trip.departureTime,
          departureAt: trip.departureAt,
          loadLabel: trip.loadLabel,
          unloadLabel: trip.unloadLabel,
          slotsAvailable: trip.slotsAvailable,
          loadRunStopId: trip.loadRunStopId,
          unloadRunStopId: trip.unloadRunStopId,
          commitmentLevel: 'run_confirmed',
        } : {
          runId: null,
          commitmentLevel: 'service_confirmed',
        }),
      };
      offers.push({
        serviceType: 'composed_intercity',
        name: service.providerName ? `${service.providerName} Delivery` : 'Kentexa Standard',
        price: hasInstantPrice ? linehaul + pickupFee + deliveryFee : null,
        pricingMode: hasInstantPrice ? 'instant' : 'quote_required',
        currency: 'TZS',
        fulfillmentStatus: {
          pickup: dto.pickup === 'door' ? (pickupReady ? 'priced' : 'pending') : 'included',
          delivery: dto.delivery === 'door' ? (deliveryReady ? 'priced' : 'pending') : 'included',
        },
        etaLabel: trip
          ? (trip.estimatedHours ? `About ${trip.estimatedHours} hours linehaul` : `${trip.date} ${trip.departureTime}`)
          : (service.estimatedHours ? `About ${service.estimatedHours} hours linehaul` : 'Scheduled service'),
        firstAction: dto.pickup === 'door'
          ? { type: 'offer_pickup_task', actorCapability: 'local_agent', candidateAgentIds: originAgents.map((a: any) => a.id) }
          : { type: 'customer_dropoff', actorCapability: 'kentexa_point' },
        fulfillment: {
          pickup: dto.pickup === 'door' ? 'agent' : 'customer_dropoff',
          linehaul: 'transport_provider',
          delivery: dto.delivery === 'door' ? 'agent' : 'customer_collect',
          transportOption: option,
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
