import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AgentsService } from '../agents/agents.service';
import { LocationIntelligenceService } from '../location-intelligence/location-intelligence.service';
import { findNearestOffice, NO_AGENT_NOW } from './nearest-office';
import { TransportService } from './transport.service';
import { JourneyComposerService } from './journey-composer.service';
import { OfficePriceService } from '../super-agents/office-price.service';
import { OfficePickupOffer, OfficeRateRow, officeChargeText, officeEtaLabel, officePickupFeeFor, officePickupTableReady, officeSameCityColumnReady, isSameCityTrip, pickOfficeRates } from './office-offers';

export interface DiscoverServiceOffersDto {
  fromCity: string; toCity: string; weightKg: number;
  pickup: 'door' | 'point'; delivery: 'door' | 'collect';
  origin?: any; destination?: any;
  providerId?: number;
  discoveryOnly?: boolean;
  /** Send form v2: the sender's declared value (TZS). Office offers need it (% of value). */
  declaredValue?: number;
  /** The sender's phone pin, when given: an office that collects within a distance needs it. */
  pickupPoint?: { latitude?: number; longitude?: number } | null;
}
export interface CommitServiceOfferDto extends DiscoverServiceOffersDto { serviceType: 'direct_delivery' | 'composed_intercity' | 'office'; routeId?: number; runId?: number; officeId?: number; paymentMethod?: 'cash' | 'prepaid'; cargoRequirements?: any; }

export interface LogisticsServiceOffer {
  serviceType: 'direct_delivery' | 'composed_intercity' | 'office';
  name: string; price: number | null; currency: 'TZS'; etaLabel: string;
  pricingMode?: 'instant' | 'quote_required';
  // For an intercity offer `price` is the transport fare only -- the same
  // number POST /transport/quotes freezes. Door pickup/delivery is never
  // inside it: 'separate' means an Agent covers that city and charges on top,
  // 'pending' means no Agent covers it yet, 'included' means no door leg.
  fulfillmentStatus?: { pickup: 'included' | 'separate' | 'pending'; delivery: 'included' | 'separate' | 'pending' };
  firstAction: { type: 'offer_pickup_task' | 'customer_dropoff'; actorCapability: 'local_agent' | 'kentexa_point'; candidateAgentIds?: number[] };
  fulfillment: { pickup: 'agent' | 'customer_dropoff'; linehaul: 'none' | 'transport_provider' | 'office'; delivery: 'agent' | 'customer_collect'; transportOption?: any; officeOption?: any };
}

export interface DoorCheckDto { fromCity: string; weightKg: number; origin?: any; }

@Injectable()
export class LogisticsServiceOfferService {
  constructor(
    private readonly agents: AgentsService,
    private readonly transport: TransportService,
    private readonly journeys: JourneyComposerService,
    // Optional only so hand-built test instances keep constructing.
    @Optional() private readonly db?: DataSource,
    @Optional() private readonly locations?: LocationIntelligenceService,
    @Optional() private readonly officePrices?: OfficePriceService,
  ) {}

  /**
   * Early check for "Mlango kwa mlango ndani ya mji" (KNOWN_FAULTS #24): is an
   * online agent with a base point available in this city right now? If not,
   * the nearest Super Agent office, so the sender can bring the parcel in.
   */
  async doorCheck(dto: DoorCheckDto) {
    const city = typeof dto?.fromCity === 'string' ? dto.fromCity.trim() : '';
    const weight = Number(dto?.weightKg);
    if (!city || !Number.isFinite(weight) || weight <= 0) throw new BadRequestException('fromCity and a positive weightKg are required');
    const agents = await this.agents.getAvailableAgents(city, weight);
    if (agents.some((a: any) => a.hasBasePoint)) return { available: true, nearestOffice: null };
    return { available: false, ...NO_AGENT_NOW, nearestOffice: await this.nearestOffice(city, dto.origin) };
  }

  private async nearestOffice(city: string, origin: any) {
    if (!this.db) return null;
    let point: { latitude: number; longitude: number } | null = null;
    const place = origin?.place;
    if (this.locations && typeof place?.providerKey === 'string' && typeof place?.providerPlaceId === 'string') {
      const candidate: any = await this.locations.resolve({ providerKey: place.providerKey, providerPlaceId: place.providerPlaceId }).catch(() => null);
      if (Number.isFinite(Number(candidate?.latitude)) && Number.isFinite(Number(candidate?.longitude))) {
        point = { latitude: Number(candidate.latitude), longitude: Number(candidate.longitude) };
      }
    }
    return findNearestOffice(this.db, city, point);
  }

  async commit(userId: number, dto: CommitServiceOfferDto) {
    // Re-discover immediately: the client cannot commit a stale/fabricated service.
    if (dto.serviceType === 'office') return this.commitOffice(userId, dto);
    const offers = await this.discover(dto);
    if (dto.serviceType === 'direct_delivery') {
      if (!offers.some(o => o.serviceType === 'direct_delivery')) {
        // Same answer as the early check, in Swahili, with the nearest office.
        throw new BadRequestException({ statusCode: 400, error: 'Bad Request', ...NO_AGENT_NOW,
          nearestOffice: await this.nearestOffice(dto.fromCity, dto.origin).catch(() => null) });
      }
      return this.journeys.selectDirectDelivery(userId, {
        origin: dto.origin, destination: dto.destination,
        originSnapshot: dto.origin ? undefined : { city: dto.fromCity },
        destinationSnapshot: dto.destination ? undefined : { city: dto.toCity },
        cargoRequirements: dto.cargoRequirements ?? { weightKg: dto.weightKg },
        paymentMethod: dto.paymentMethod,
      } as any);
    }
    // A discovered intercity offer is a concrete Transport Run. Preserve
    // pickup/delivery outcomes while binding the transport leg to that Run;
    // this is what connects the new Shipment to the transporter's manifest
    // and to the Run's Super Agent load/unload hubs.
    const runId = Number(dto.runId);
    if (!Number.isInteger(runId) || runId <= 0) {
      throw new BadRequestException('Choose a trip from fresh transport supply');
    }
    return this.journeys.selectService(userId, {
      origin: dto.origin, destination: dto.destination,
      originSnapshot: dto.origin ? undefined : { city: dto.fromCity },
      destinationSnapshot: dto.destination ? undefined : { city: dto.toCity },
      cargoRequirements: dto.cargoRequirements ?? { weightKg: dto.weightKg },
      paymentMethod: dto.paymentMethod,
      providerId: Number(dto.providerId),
      routeId: Number(dto.routeId),
      runId,
      pickup: dto.pickup,
      delivery: dto.delivery,
    } as any);

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
      cargoRequirements: dto.cargoRequirements ?? { weightKg: dto.weightKg },
      paymentMethod: dto.paymentMethod, providerId, routeId, pickup: dto.pickup, delivery: dto.delivery,
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
      // Door pickup needs an online agent WITH a base point (the same rule as
      // the early check, doorCheck): pickups go to the nearest base first.
      const pickupAgents = originAgents.filter((a: any) => a.hasBasePoint);
      const directAgent: any = dto.pickup === 'door' ? pickupAgents[0] : deliveryAgent;
      if (!directAgent) return [];
      const directPickupFee = dto.pickup === 'door' ? Number(directAgent.collectionFeeUrban ?? directAgent.deliveryFee ?? 0) : 0;
      return [{
        serviceType: 'direct_delivery', name: 'Direct Delivery', price: Math.max(directPickupFee, deliveryFee), currency: 'TZS',
        etaLabel: directAgent.deliveryTime ?? 'Same day',
        firstAction: dto.pickup === 'door' && pickupAgents.length > 0
          ? { type: 'offer_pickup_task', actorCapability: 'local_agent', candidateAgentIds: pickupAgents.map((a: any) => a.id) }
          : { type: 'customer_dropoff', actorCapability: 'kentexa_point' },
        fulfillment: { pickup: dto.pickup === 'door' ? 'agent' : 'customer_dropoff', linehaul: 'none', delivery: dto.delivery === 'door' ? 'agent' : 'customer_collect' },
      }];
    }

    // Customer-facing discovery is route coverage, not today's schedule.
    // A verified transporter that actively serves the requested route remains
    // visible even when no TransportRun has been published for that date.
    // This is deliberately display/discovery only: the commit path below is
    // unchanged and still requires a concrete Run, so this patch cannot create
    // a shipment that is detached from a transporter manifest or Run hubs.
    const routeServices = await this.transport.discoverServiceRoutes(
      from,
      to,
      weight,
      dto.providerId ? Number(dto.providerId) : undefined,
    );
    const { trips } = await this.transport.discoverSupply(from, to, weight, {
      providerId: dto.providerId ? Number(dto.providerId) : undefined,
    });
    const tripsByRoute = new Map<number, any[]>();
    for (const trip of trips) {
      const routeId = Number(trip.routeId);
      const list = tripsByRoute.get(routeId) ?? [];
      list.push(trip);
      tripsByRoute.set(routeId, list);
    }

    const offers: LogisticsServiceOffer[] = [];
    for (const service of routeServices) {
      const trip = (tripsByRoute.get(Number(service.routeId)) ?? [])[0] ?? null;
      // Same formula as TransportQuoteService.computeTransportBase, so the
      // card price and the confirmed quote are the same number.
      const linehaul = Math.max(
        Number(service.pricePerKg) * weight,
        Number(service.fixedFee) || 0,
      );
      const hasInstantPrice = linehaul > 0;
      const pickupReady = dto.pickup !== 'door' || originAgents.length > 0;
      const deliveryReady = dto.delivery !== 'door' || destinationAgents.length > 0;
      // Kentexa carries nothing, so an offer is always named after the
      // transporter that actually runs it.
      const providerName = service.providerName?.trim() || service.providerBusinessName || 'Transport provider';

      offers.push({
        serviceType: 'composed_intercity',
        name: providerName,
        price: hasInstantPrice ? linehaul : null,
        pricingMode: hasInstantPrice ? 'instant' : 'quote_required',
        currency: 'TZS',
        fulfillmentStatus: {
          pickup: dto.pickup === 'door' ? (pickupReady ? 'separate' : 'pending') : 'included',
          delivery: dto.delivery === 'door' ? (deliveryReady ? 'separate' : 'pending') : 'included',
        },
        etaLabel: trip?.estimatedHours
          ? 'About ' + trip.estimatedHours + ' hours linehaul'
          : service.estimatedHours
            ? 'About ' + service.estimatedHours + ' hours linehaul'
            : 'Route service',
        firstAction: dto.pickup === 'door'
          ? { type: 'offer_pickup_task', actorCapability: 'local_agent', candidateAgentIds: originAgents.map((a: any) => a.id) }
          : { type: 'customer_dropoff', actorCapability: 'kentexa_point' },
        fulfillment: {
          pickup: dto.pickup === 'door' ? 'agent' : 'customer_dropoff',
          linehaul: 'transport_provider',
          delivery: dto.delivery === 'door' ? 'agent' : 'customer_collect',
          transportOption: trip
            ? {
                ...trip,
                providerName,
                commitmentLevel: 'run_confirmed',
                runId: trip.runId,
                loadRunStopId: trip.loadRunStopId,
                unloadRunStopId: trip.unloadRunStopId,
              }
            : {
                providerId: service.providerId,
                providerName,
                routeId: service.routeId,
                pricePerKg: service.pricePerKg,
                fixedFee: service.fixedFee,
                estimatedHours: service.estimatedHours,
                commitmentLevel: 'service_discovered',
                runId: null,
                runResolutionRequired: true,
              },
        },
      });
    }
    // Instant-price services rank first by price. Quote-required providers
    // remain visible instead of disappearing merely because pricing has not
    // been configured yet. Sort the whole list BEFORE keeping the top 8, so
    // the cheapest services are never dropped for older route ids.
    const transportOffers = offers.sort((a, b) => {
      if (a.price == null && b.price == null) return a.name.localeCompare(b.name);
      if (a.price == null) return 1;
      if (b.price == null) return -1;
      return a.price - b.price;
    }).slice(0, 8);
    // Offices compete too (owner 2026-10-23). Never fails the transporter answer.
    const officeOffers = await this.officeOffers(dto).catch(() => [] as LogisticsServiceOffer[]);
    return [...transportOffers, ...officeOffers];
  }

  /** A side's place names (region, district) for matching offices and their rates. */
  private async placeNames(side: any, typed: string) {
    const place = side?.place;
    if (this.locations && typeof place?.providerKey === 'string' && typeof place?.providerPlaceId === 'string') {
      const c: any = await this.locations.resolve({ providerKey: place.providerKey, providerPlaceId: place.providerPlaceId }).catch(() => null);
      if (c) return { regionName: c.regionName ?? null, districtName: c.districtName ?? null, city: typed, label: c.displayLabel ?? typed,
        latitude: c.latitude ?? null, longitude: c.longitude ?? null };
    }
    return { regionName: null, districtName: null, city: typed, label: typed, latitude: null, longitude: null };
  }

  /**
   * Every active, non-training office in the sender's city with an active rate to the
   * destination, priced by its own rule for this parcel (value, kg). Intercity only.
   */
  async officeOffers(dto: DiscoverServiceOffersDto): Promise<LogisticsServiceOffer[]> {
    const value = Number(dto?.declaredValue);
    if (!this.db || !this.officePrices || !Number.isFinite(value) || value <= 0) return [];
    const from = dto.fromCity.trim(); const to = dto.toCity.trim(); const weight = Number(dto.weightKg) || 0;
    const [origin, destination] = await Promise.all([this.placeNames(dto.origin, from), this.placeNames(dto.destination, to)]);
    // Inside one city an agent or a transporter carries it; only offices that chose
    // same-city delivery compete there (owner 2026-10-24).
    let sameCityOffices: Set<number> | null = null;
    if (isSameCityTrip(from, to, origin, destination)) {
      if (!(await officeSameCityColumnReady(this.db))) return [];
      const ids: any[] = await this.db.query(
        `SELECT "superAgentId" FROM public.office_pickup_offer WHERE "sameCityDelivery" = true`).catch(() => []);
      sameCityOffices = new Set(ids.map((r) => Number(r.superAgentId)));
      if (!sameCityOffices.size) return [];
    }
    const rows: OfficeRateRow[] = (await this.db.query(`
      SELECT sa.id AS "officeId", sa."businessName", sa.city AS "officeCity", sa.address AS "officeAddress",
             sa.latitude AS "officeLatitude", sa.longitude AS "officeLongitude",
             sa.rating, sa."totalRatings", sr."destinationCity", sr."ratePerKg", sr."minimumCharge", sr."estimatedDays"
        FROM public.super_agent sa
        JOIN public.shipping_rate sr ON sr."superAgentId" = sa.id AND sr."isActive" = true
       WHERE sa.status = 'active' AND sa."isTrainingOffice" = false`)).map((r: any) => ({
      ...r, officeId: Number(r.officeId), ratePerKg: Number(r.ratePerKg), minimumCharge: Number(r.minimumCharge),
      estimatedDays: r.estimatedDays == null ? null : Number(r.estimatedDays),
      rating: r.rating == null ? null : Number(r.rating), totalRatings: r.totalRatings == null ? null : Number(r.totalRatings),
    }));
    const chosen = pickOfficeRates(rows, origin, destination)
      .filter((r) => !sameCityOffices || sameCityOffices.has(r.officeId));
    // Offices that collect from the sender themselves (free or their own fee).
    const pickupOffers = new Map<number, OfficePickupOffer>();
    if (dto.pickup === 'door' && chosen.length && await officePickupTableReady(this.db)) {
      const offers: any[] = await this.db.query(`SELECT "superAgentId", mode, fee, "maxKm" FROM public.office_pickup_offer
        WHERE "superAgentId" = ANY($1::int[]) AND mode <> 'none'`, [chosen.map((r) => r.officeId)]).catch(() => []);
      for (const o of offers) {
        pickupOffers.set(Number(o.superAgentId), { mode: o.mode, fee: o.fee == null ? null : Number(o.fee), maxKm: o.maxKm == null ? null : Number(o.maxKm) });
      }
    }
    const senderPoint = dto.pickupPoint?.latitude != null ? dto.pickupPoint : { latitude: (origin as any).latitude, longitude: (origin as any).longitude };
    const out: LogisticsServiceOffer[] = [];
    for (const rate of chosen) {
      const office: any = { id: rate.officeId, city: rate.officeCity, address: rate.officeAddress };
      const officePickupFee = dto.pickup === 'door'
        ? officePickupFeeFor(pickupOffers.get(rate.officeId), { latitude: (rate as any).officeLatitude, longitude: (rate as any).officeLongitude }, senderPoint)
        : null;
      // The office collects itself: its own fee (0 = free). Otherwise, in Dar es Salaam an
      // agent pickup to the office is the boda fee; both are inside the total.
      const quoted = await this.officePrices.quoteFor(office, {
        destinationCity: rate.destinationCity, declaredValue: value, weightKg: weight, servicePath: 'intercity',
        pickupAddress: dto.pickup === 'door' && officePickupFee == null ? origin.label : null,
      }).catch(() => null);
      if (!quoted) continue;
      const quote = officePickupFee == null ? quoted : {
        ...quoted, pickup: { ...quoted.pickup, amount: officePickupFee }, total: quoted.total - quoted.pickup.amount + officePickupFee,
      };
      const pickupInTotal = dto.pickup === 'door' && (officePickupFee != null || quote.pickup.amount > 0);
      out.push({
        serviceType: 'office',
        name: rate.businessName,
        price: quote.noSuggestion ? null : quote.total,
        pricingMode: quote.noSuggestion ? 'quote_required' : 'instant',
        currency: 'TZS',
        etaLabel: officeEtaLabel(rate.estimatedDays),
        fulfillmentStatus: {
          pickup: dto.pickup === 'door' ? (pickupInTotal ? 'included' : 'separate') : 'included',
          delivery: dto.delivery === 'door' ? 'separate' : 'included',
        },
        firstAction: dto.pickup === 'door'
          ? { type: 'offer_pickup_task', actorCapability: 'local_agent' }
          : { type: 'customer_dropoff', actorCapability: 'kentexa_point' },
        fulfillment: {
          pickup: dto.pickup === 'door' ? 'agent' : 'customer_dropoff',
          linehaul: 'office',
          delivery: dto.delivery === 'door' ? 'agent' : 'customer_collect',
          officeOption: {
            officeId: rate.officeId, officeName: rate.businessName, officeCity: rate.officeCity,
            officeAddress: rate.officeAddress, rating: rate.rating, totalRatings: rate.totalRatings,
            destinationCity: rate.destinationCity, estimatedDays: rate.estimatedDays,
            chargeText: officeChargeText(quote.transport),
            pickupBy: officePickupFee != null ? 'office' : (dto.pickup === 'door' ? 'agent' : null),
            quote: { pickup: quote.pickup.amount, transport: quote.transport.amount, total: quote.total, ruleSource: quote.ruleSource },
          },
        },
      });
    }
    return out.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity)).slice(0, 10);
  }

  /** The sender chose an office: re-price it now (never the client's numbers) and compose the journey. */
  private async commitOffice(userId: number, dto: CommitServiceOfferDto) {
    const officeId = Number(dto.officeId);
    if (!Number.isInteger(officeId) || officeId <= 0) throw new BadRequestException('Chagua ofisi');
    const value = Number(dto.declaredValue ?? dto.cargoRequirements?.declaredValue);
    const offers = await this.officeOffers({ ...dto, declaredValue: value });
    const chosen = offers.find((o) => Number(o.fulfillment.officeOption?.officeId) === officeId);
    if (!chosen) throw new BadRequestException('Ofisi hii haipatikani tena kwa safari hii. Chagua ofa nyingine.');
    return this.journeys.selectOfficeService(userId, {
      origin: dto.origin, destination: dto.destination,
      originSnapshot: dto.origin ? undefined : { city: dto.fromCity },
      destinationSnapshot: dto.destination ? undefined : { city: dto.toCity },
      cargoRequirements: { ...(dto.cargoRequirements ?? { weightKg: dto.weightKg }), declaredValue: value },
      paymentMethod: dto.paymentMethod,
      pickup: dto.pickup, delivery: dto.delivery,
      officeId, officeName: chosen.name, office: chosen.fulfillment.officeOption,
    } as any);
  }
}