import { agentCovers, agentRadiusKm, geoPoint, kmBetween, officeRadiusKm, samePlace } from '../location-intelligence/place-match';
import { agentOnlineRequired } from '../agents/agent-online';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { officesInArrears, paidUpFirst } from '../kentexa-fee/paid-up-gate';
import { DataSource } from 'typeorm';
import { AgentsService } from '../agents/agents.service';
import { LocationIntelligenceService } from '../location-intelligence/location-intelligence.service';
import { findNearestOffice, NO_AGENT_NOW } from './nearest-office';
import { TransportService } from './transport.service';
import { JourneyComposerService } from './journey-composer.service';
import { OfficePriceService } from '../super-agents/office-price.service';
import { OfficeBodaFeeService } from '../super-agents/office-boda-fee.service';
import { isDarEsSalaam } from '../Utils/delivery-zone-detector';
import { darMatch } from '../boda-rates/dar-boda-zones';
import { OfficePickupOffer, OfficeRateRow, officeChargeText, officeEtaLabel, officePickupFeeFor, officePickupTableReady, officeSameCityColumnReady, isSameCityTrip, officeServesOrigin, pickOfficeRates, rateServesDestination } from './office-offers';

export interface DiscoverServiceOffersDto {
  fromCity: string; toCity: string; weightKg: number;
  pickup: 'door' | 'point'; delivery: 'door' | 'collect';
  origin?: any; destination?: any;
  /** Dar zones: an area the customer picked for a place KenteXa did not know (read before the place). */
  originArea?: string; destinationArea?: string;
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
  /** Dar same-city: a place the zone table does not know (price null; the customer picks an area). */
  areaUnknown?: boolean;
  /** Which place KenteXa did not know, so the form asks only for that one. */
  unknownPlaces?: ('origin' | 'destination')[];
  /** Dar same-city: the places the fare is from and to, and the place of the GPS pin when it is in another zone. */
  fromPlace?: string | null; toPlace?: string | null; pinPlace?: string | null;
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
    @Optional() private readonly darFees?: OfficeBodaFeeService,
  ) {}

  /** A place as words the Dar zone table can read: the typed text, or the resolved place's names. */
  private async placeWords(side: any): Promise<string | null> {
    if (typeof side?.text === 'string' && side.text.trim()) return side.text.trim();
    const place = side?.place;
    if (!this.locations || typeof place?.providerKey !== 'string' || typeof place?.providerPlaceId !== 'string') return null;
    const c: any = await this.locations.resolve({ providerKey: place.providerKey, providerPlaceId: place.providerPlaceId }).catch(() => null);
    const words = [c?.displayLabel, c?.wardName, c?.districtName].filter((x) => typeof x === 'string' && x.trim()).join(', ');
    return words || null;
  }

  /**
   * Dar es Salaam same-city trips are priced by zone (owner approved 2026-11-02: zone price
   * only; the agent's old flat fee is no longer used in Dar). undefined = not a Dar trip;
   * null = a place the zone table does not know (the customer picks an area).
   */
  private async darZoneFee(city: string, dto: DiscoverServiceOffersDto, weight: number): Promise<{
    fee: number | null; unknown: ('origin' | 'destination')[]; fromPlace: string | null; toPlace: string | null; pinPlace: string | null;
  } | undefined> {
    if (!this.darFees || !isDarEsSalaam(city)) return undefined;
    const withArea = (area: unknown, words: string | null) =>
      [typeof area === 'string' ? area.trim().slice(0, 60) : '', words || ''].filter(Boolean).join(' — ') || null;
    const [from, to] = await Promise.all([this.placeWords(dto.origin), this.placeWords(dto.destination)]);
    const fromText = withArea(dto.originArea, from); const toText = withArea(dto.destinationArea, to);
    // Coordinates when the words name no known area (owner 2026-11-08): the nearest Dar ward
    // to the sender's pin or the chosen place's point, within 6 km.
    const [fromPoint, toPoint] = await Promise.all([this.sidePoint(dto.origin, dto.pickup === 'door' ? dto.pickupPoint : null), this.sidePoint(dto.destination, null)]);
    const fromMatch = darMatch(fromText) ?? (fromPoint ? await this.darPinPlace(fromPoint) : null);
    const toMatch = darMatch(toText) ?? (toPoint ? await this.darPinPlace(toPoint) : null);
    const unknown: ('origin' | 'destination')[] = [];
    if (!fromMatch) unknown.push('origin');
    if (!toMatch) unknown.push('destination');
    // Priced on the area names KenteXa read (words, or the nearest ward to the point).
    const fee = unknown.length ? null : await this.darFees.feeBetween(fromMatch!.place, toMatch!.place, weight).catch(() => null);
    // The sender's GPS pin (owner 2026-11-02: "I put my pin at Kigamboni, nothing changed"):
    // when it sits in another zone than "Kutoka", say where, so the form can ask which is right.
    const pin = dto.pickup === 'door' ? await this.darPinPlace(dto.pickupPoint) : null;
    const pinPlace = pin && fromMatch && pin.zone.key !== fromMatch.zone.key ? pin.place : null;
    return { fee, unknown, fromPlace: fromMatch?.place ?? null, toPlace: toMatch?.place ?? null, pinPlace };
  }

  /** A side's map point: the given pin, else the resolved place's point; null when neither. */
  private async sidePoint(side: any, pin: { latitude?: number; longitude?: number } | null | undefined) {
    const p = geoPoint(pin?.latitude, pin?.longitude);
    if (p) return p;
    const place = side?.place;
    if (!this.locations || typeof place?.providerKey !== 'string' || typeof place?.providerPlaceId !== 'string') return null;
    const c: any = await this.locations.resolve({ providerKey: place.providerKey, providerPlaceId: place.providerPlaceId }).catch(() => null);
    return geoPoint(c?.latitude, c?.longitude);
  }

  /**
   * The Dar place nearest a GPS pin: the closest location-seed ward that has a map point
   * (never an invented one), within 6 km; null when the pin is not near any.
   */
  private async darPinPlace(point: { latitude?: number; longitude?: number } | null | undefined) {
    const lat = Number(point?.latitude); const lng = Number(point?.longitude);
    if (!this.db || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const [w] = await this.db.query(
      `SELECT w.name, sqrt(power((w.lat::float8 - $1::float8) * 111.32, 2) + power((w.lng::float8 - $2::float8) * 111.32 * cos(radians($1::float8)), 2)) AS km
         FROM public.tz_ward w JOIN public.tz_region r ON r.id = w.region_id
        WHERE r.name = 'Dar es Salaam' AND w.lat IS NOT NULL AND w.lng IS NOT NULL AND w."isActive" = true
        ORDER BY km ASC LIMIT 1`, [lat, lng]).catch(() => []);
    if (!w || !(Number(w.km) <= 6)) return null;
    return darMatch(String(w.name));
  }

  /**
   * Early check for "Mlango kwa mlango ndani ya mji" (KNOWN_FAULTS #24): is an
   * online agent with a base point available in this city right now? If not,
   * the nearest Super Agent office, so the sender can bring the parcel in.
   */
  async doorCheck(dto: DoorCheckDto) {
    const city = typeof dto?.fromCity === 'string' ? dto.fromCity.trim() : '';
    const weight = Number(dto?.weightKg);
    if (!city || !Number.isFinite(weight) || weight <= 0) throw new BadRequestException('fromCity and a positive weightKg are required');
    // Coordinates first (place-match.ts): the sender's pin, else the chosen place's point.
    const origin = await this.placeNames(dto.origin, city);
    const point = geoPoint((dto as any).pickupPoint?.latitude, (dto as any).pickupPoint?.longitude) ?? geoPoint(origin.latitude, origin.longitude);
    const agents = await this.agents.getAvailableAgents(city, weight, point);
    // Owner 2026-11-08: an agent without a base still gets the job (he is asked to set it to accept).
    if (agents.length) return { available: true, nearestOffice: null };
    return { available: false, ...NO_AGENT_NOW, nearestOffice: await this.nearestOffice(city, dto.origin) };
  }

  /** The nearest office that delivers inside the city (it chose same-city delivery), or null. */
  private async nearestOffice(city: string, origin: any) {
    if (!this.db || !(await officeSameCityColumnReady(this.db))) return null;
    let point: { latitude: number; longitude: number } | null = null;
    const place = origin?.place;
    if (this.locations && typeof place?.providerKey === 'string' && typeof place?.providerPlaceId === 'string') {
      const candidate: any = await this.locations.resolve({ providerKey: place.providerKey, providerPlaceId: place.providerPlaceId }).catch(() => null);
      if (Number.isFinite(Number(candidate?.latitude)) && Number.isFinite(Number(candidate?.longitude))) {
        point = { latitude: Number(candidate.latitude), longitude: Number(candidate.longitude) };
      }
    }
    return findNearestOffice(this.db, city, point, { sameCityDeliveryOnly: true });
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
      if (offers.some(o => o.serviceType === 'direct_delivery' && o.areaUnknown)) {
        throw new BadRequestException('Chagua eneo lako la Dar es Salaam kwanza, ili bei ya usafiri ijulikane.');
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
  }

  async discover(dto: DiscoverServiceOffersDto): Promise<LogisticsServiceOffer[]> {
    const from = dto?.fromCity?.trim(); const to = dto?.toCity?.trim(); const weight = Number(dto?.weightKg);
    if (!from || !to || !Number.isFinite(weight) || weight <= 0) throw new BadRequestException('fromCity, toCity and a positive weightKg are required');
    if (!['door', 'point'].includes(dto.pickup) || !['door', 'collect'].includes(dto.delivery)) throw new BadRequestException('Invalid pickup or delivery outcome');

    const sameCity = from.toLocaleLowerCase('en') === to.toLocaleLowerCase('en') || samePlace(from, to);
    // Coordinates first (owner 2026-11-08): the sender's pin, else each chosen place's point.
    const [originPlace, destinationPlace] = await Promise.all([this.placeNames(dto.origin, from), this.placeNames(dto.destination, to)]);
    const pickupPoint = geoPoint(dto.pickupPoint?.latitude, dto.pickupPoint?.longitude) ?? geoPoint(originPlace.latitude, originPlace.longitude);
    const dropPoint = geoPoint(destinationPlace.latitude, destinationPlace.longitude);
    const [originAgents, destinationAgents] = await Promise.all([
      dto.pickup === 'door' ? this.agents.getAvailableAgents(from, weight, pickupPoint) : Promise.resolve([]),
      dto.delivery === 'door' ? this.agents.getAvailableAgents(to, weight, dropPoint) : Promise.resolve([]),
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
      // Every agent who covers the pickup (owner 2026-11-08): nearest base first, then agents
      // without a base, who are asked to set it before accepting (pickup-tasks claim).
      const pickupAgents = originAgents;
      const directAgent: any = dto.pickup === 'door' ? pickupAgents[0] : deliveryAgent;
      // Offices that chose same-city delivery compete here too (owner 2026-10-24);
      // officeOffers keeps every other office out of a same-city trip.
      const sameCityOffices = await this.officeOffers(dto).catch(() => [] as LogisticsServiceOffer[]);
      if (!directAgent) return sameCityOffices;
      const directPickupFee = dto.pickup === 'door' ? Number(directAgent.collectionFeeUrban ?? directAgent.deliveryFee ?? 0) : 0;
      const dar = await this.darZoneFee(from, dto, weight);
      return [{
        serviceType: 'direct_delivery', name: 'Direct Delivery',
        price: dar === undefined ? Math.max(directPickupFee, deliveryFee) : dar.fee, currency: 'TZS',
        ...(dar && dar.unknown.length ? { areaUnknown: true, unknownPlaces: dar.unknown } : {}),
        ...(dar ? { fromPlace: dar.fromPlace, toPlace: dar.toPlace, pinPlace: dar.pinPlace } : {}),
        etaLabel: directAgent.deliveryTime ?? 'Same day',
        firstAction: dto.pickup === 'door' && pickupAgents.length > 0
          ? { type: 'offer_pickup_task', actorCapability: 'local_agent', candidateAgentIds: pickupAgents.map((a: any) => a.id) }
          : { type: 'customer_dropoff', actorCapability: 'kentexa_point' },
        fulfillment: { pickup: dto.pickup === 'door' ? 'agent' : 'customer_dropoff', linehaul: 'none', delivery: dto.delivery === 'door' ? 'agent' : 'customer_collect' },
      }, ...sameCityOffices];
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
  private goodsColumnReady = false;
  private goodsCheckedAt = 0;
  /** Offices whose goods list (super_agent."goodsTypes", migration 1793200000000) leaves out parcels. */
  private async officesWithoutParcels(): Promise<Set<number>> {
    if (!this.db) return new Set();
    if (!this.goodsColumnReady && Date.now() - this.goodsCheckedAt > 60_000) {
      this.goodsCheckedAt = Date.now();
      const [row] = await this.db.query(`SELECT 1 AS ok FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'super_agent' AND column_name = 'goodsTypes'`).catch(() => []);
      this.goodsColumnReady = Boolean(row?.ok);
    }
    if (!this.goodsColumnReady) return new Set();
    const rows: any[] = await this.db.query(`SELECT id FROM public.super_agent
      WHERE "goodsTypes" IS NOT NULL AND NOT ("goodsTypes" ? 'parcel')`).catch(() => []);
    return new Set(rows.map((r) => Number(r.id)));
  }

  /**
   * Offices whose own transporter runs this trip (owner 2026-11-09: "Ar SAMATTA added prices for
   * regions, but no office is shown"): the transporter's active route from the sender's town to the
   * destination counts as the office's route, priced per kg from that route, when the office has no
   * "Bei zangu" row for it. Linked = the same owner, or the office is a parcel-acceptance stop of the
   * route. The customer still faces the office only (owner 2026-10-26).
   */
  private async transportBackedRates(from: string, to: string, weight: number): Promise<Map<number, { destinationCity: string; ratePerKg: number; minimumCharge: number; estimatedDays: number | null; via: string }>> {
    const out = new Map<number, { destinationCity: string; ratePerKg: number; minimumCharge: number; estimatedDays: number | null; via: string }>();
    if (!this.db || !this.transport?.discoverServiceRoutes) return out;
    const services: any[] = await this.transport.discoverServiceRoutes(from, to, weight).catch(() => []);
    if (!services.length) return out;
    const owners: any[] = await this.db.query(`SELECT id, "userId" FROM public.transport_provider WHERE id = ANY($1::int[])`,
      [[...new Set(services.map((x) => Number(x.providerId)))]]).catch(() => []);
    const ownerOf = new Map(owners.map((r) => [Number(r.id), r.userId == null ? null : Number(r.userId)]));
    const userIds = [...new Set([...ownerOf.values()].filter((v): v is number => v != null))];
    const owned: any[] = userIds.length ? await this.db.query(`SELECT id, "userId" FROM public.super_agent WHERE "userId" = ANY($1::int[])`, [userIds]).catch(() => []) : [];
    for (const svc of services) {
      const ids = new Set<number>((svc.originPoints || []).map((p: any) => Number(p.hubId)));
      const owner = ownerOf.get(Number(svc.providerId));
      for (const o of owned) if (owner != null && Number(o.userId) === owner) ids.add(Number(o.id));
      const rate = { destinationCity: to, ratePerKg: Number(svc.pricePerKg) || 0, minimumCharge: Number(svc.fixedFee) || 0,
        estimatedDays: Number(svc.estimatedHours) > 0 ? Math.max(1, Math.ceil(Number(svc.estimatedHours) / 24)) : null,
        via: String(svc.providerName || svc.providerBusinessName || '').trim() };
      for (const id of ids) {
        const prev = out.get(id);
        // The cheaper of two routes for the same office.
        if (!prev || Math.max(rate.ratePerKg * weight, rate.minimumCharge) < Math.max(prev.ratePerKg * weight, prev.minimumCharge)) out.set(id, rate);
      }
    }
    return out;
  }

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
             sa.latitude AS "officeLatitude", sa.longitude AS "officeLongitude", sa.phone AS "officePhone",
             sa.rating, sa."totalRatings", sr."destinationCity", sr."ratePerKg", sr."minimumCharge", sr."estimatedDays"
        FROM public.super_agent sa
        JOIN public.shipping_rate sr ON sr."superAgentId" = sa.id AND sr."isActive" = true
       WHERE sa.status = 'active' AND sa."isTrainingOffice" = false`)).map((r: any) => ({
      ...r, officeId: Number(r.officeId), ratePerKg: Number(r.ratePerKg), minimumCharge: Number(r.minimumCharge),
      estimatedDays: r.estimatedDays == null ? null : Number(r.estimatedDays),
      rating: r.rating == null ? null : Number(r.rating), totalRatings: r.totalRatings == null ? null : Number(r.totalRatings),
    }));
    // Offices whose own transporter runs this trip (transportBackedRates): their route counts
    // when "Bei zangu" has no row for this destination. Intercity only.
    const backed = sameCityOffices ? new Map() : await this.transportBackedRates(from, to, weight);
    if (backed.size) {
      const haveRow = new Set(rows.filter((r) => rateServesDestination(r.destinationCity, destination)).map((r) => r.officeId));
      const need = [...backed.keys()].filter((id) => !haveRow.has(id));
      if (need.length) {
        const extra: any[] = await this.db.query(`SELECT sa.id AS "officeId", sa."businessName", sa.city AS "officeCity", sa.address AS "officeAddress",
            sa.latitude AS "officeLatitude", sa.longitude AS "officeLongitude", sa.phone AS "officePhone", sa.rating, sa."totalRatings"
          FROM public.super_agent sa WHERE sa.id = ANY($1::int[]) AND sa.status = 'active' AND sa."isTrainingOffice" = false`, [need]).catch(() => []);
        for (const o of extra) {
          const b = backed.get(Number(o.officeId))!;
          rows.push({ ...o, officeId: Number(o.officeId), rating: o.rating == null ? null : Number(o.rating), totalRatings: o.totalRatings == null ? null : Number(o.totalRatings),
            destinationCity: b.destinationCity, ratePerKg: b.ratePerKg, minimumCharge: b.minimumCharge, estimatedDays: b.estimatedDays, transportBacked: true } as any);
        }
      }
    }
    // An office that ticked only large goods / containers ("Bei zangu") does not take
    // small parcels: it is not offered here (owner 2026-10-26). Never set = parcels.
    const noParcels = await this.officesWithoutParcels();
    // The sender's pin, when given, is the origin point for "office in my town" (place-match.ts).
    const originForMatch = geoPoint(dto.pickupPoint?.latitude, dto.pickupPoint?.longitude)
      ? { ...origin, latitude: dto.pickupPoint!.latitude, longitude: dto.pickupPoint!.longitude } : origin;
    const chosen = pickOfficeRates(rows, originForMatch, destination)
      .filter((r) => !sameCityOffices || sameCityOffices.has(r.officeId))
      .filter((r) => !noParcels.has(r.officeId));
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
        // Priced from the office's own transport route when "Bei zangu" has no row (transportBackedRates).
        kgRate: (rate as any).transportBacked ? { ratePerKg: rate.ratePerKg, minimumCharge: rate.minimumCharge } : null,
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
            // So the sender can call the office and offices compete openly (owner 2026-11-09).
            phone: (rate as any).officePhone || null,
            distanceKm: (() => {
              const op = geoPoint((rate as any).officeLatitude, (rate as any).officeLongitude);
              const sp = geoPoint(senderPoint?.latitude, senderPoint?.longitude);
              return op && sp ? Math.round(kmBetween(op, sp) * 10) / 10 : null;
            })(),
            destinationCity: rate.destinationCity, estimatedDays: rate.estimatedDays,
            chargeText: officeChargeText(quote.transport),
            pickupBy: officePickupFee != null ? 'office' : (dto.pickup === 'door' ? 'agent' : null),
            quote: { pickup: quote.pickup.amount, transport: quote.transport.amount, total: quote.total, ruleSource: quote.ruleSource },
          },
        },
      });
    }
    const cheapestFirst = out.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    // Paid-up offices first (Ada ya KenteXa, kentexa-fee/paid-up-gate.ts); every office still listed in its group.
    const idOf = (o: LogisticsServiceOffer) => Number((o as any).fulfillment?.officeOption?.officeId);
    const arrears = await officesInArrears(this.db, cheapestFirst.map(idOf)).catch(() => new Set<number>());
    return paidUpFirst(cheapestFirst, idOf, arrears).slice(0, 10);
  }

  /**
   * "Kwa nini hakuna?" (owner 2026-11-08: "run a check on agent, office ... the system says no agent
   * available"): for one trip, EVERY agent and EVERY office with whether it qualifies and the exact
   * reason when not. The same rules as discover()/officeOffers() (place-match.ts, office-offers.ts),
   * read-only, admin only. Never invents a reason: each comes from the record.
   */
  async explain(dto: DiscoverServiceOffersDto) {
    const from = dto?.fromCity?.trim(); const to = dto?.toCity?.trim(); const weight = Number(dto?.weightKg) || 1;
    if (!from || !to) throw new BadRequestException('Andika mji wa kutoka na wa kwenda');
    if (!this.db) return { agents: [], offices: [], notes: ['Hifadhidata haipatikani'] };
    const [origin, destination] = await Promise.all([this.placeNames(dto.origin, from), this.placeNames(dto.destination, to)]);
    const pickupPoint = geoPoint(dto.pickupPoint?.latitude, dto.pickupPoint?.longitude) ?? geoPoint(origin.latitude, origin.longitude);
    const sameCity = samePlace(from, to) || from.toLowerCase() === to.toLowerCase();
    const notes: string[] = [];
    if (!pickupPoint) notes.push('Mahali pa kutoka hapana alama ya ramani: wakala na ofisi wanalinganishwa kwa majina tu.');
    const radius = agentRadiusKm();

    const agentRows: any[] = await this.db.query(`SELECT a.id, a."fullName", a.city, to_jsonb(a)->>'district' AS district, to_jsonb(a)->>'region' AS region, a.status, a."isOnline",
        a."maxWeightKg", a."baseLatitude", a."baseLongitude", COALESCE(NULLIF(btrim(a.phone), ''), u.phone) AS phone
      FROM public.agent a LEFT JOIN public."user" u ON u.id = a."userId" ORDER BY a.id`).catch(() => []);
    const agents = agentRows.map((a) => {
      const cover = agentCovers(a, { names: [from], point: pickupPoint });
      const reasons: string[] = [];
      if (a.status !== 'approved') reasons.push(`Hajaidhinishwa (hali: ${a.status})`);
      if (!cover.covers) {
        const town = a.city || a.district || a.region;
        reasons.push(cover.distanceKm != null
          ? `Kituo chake kiko km ${Math.round(cover.distanceKm)} (kikomo km ${radius}); mji wake "${town || 'haujawekwa'}" si ${from}`
          : `Mji wake "${town || 'haujawekwa'}" si ${from}${cover.hasBase ? '' : ', na hana kituo cha kupima umbali'}`);
      }
      const maxKg = Number(a.maxWeightKg || 20);
      if (weight > maxKg) reasons.push(`Uzito kg ${weight} ni zaidi ya kg ${maxKg} anazobeba`);
      if (agentOnlineRequired() && a.isOnline !== true) reasons.push('Hayuko mtandaoni (lazima awe mtandaoni)');
      const ok = reasons.length === 0;
      return { id: Number(a.id), name: a.fullName, phone: a.phone || null, city: a.city, district: a.district, region: a.region,
        status: a.status, hasBase: cover.hasBase, distanceKm: cover.distanceKm == null ? null : Math.round(cover.distanceKm * 10) / 10,
        ok, reasons, note: ok && !cover.hasBase ? 'Atapata kazi, lakini lazima aweke kituo chake kabla ya kukubali' : null };
    });

    const value = Number(dto?.declaredValue);
    if (!sameCity && !(value > 0)) notes.push('Weka thamani ya mzigo: bila thamani, ofisi hazionyeshwi kabisa.');
    const officeRows: any[] = await this.db.query(`SELECT sa.id, sa."businessName", sa.city, sa.status, sa."isTrainingOffice",
        sa.latitude, sa.longitude FROM public.super_agent sa ORDER BY sa.id`).catch(() => []);
    const rateRows: any[] = await this.db.query(`SELECT "superAgentId", "destinationCity", "isActive" FROM public.shipping_rate`).catch(() => []);
    const noParcels = await this.officesWithoutParcels();
    const sameCityIds = sameCity && await officeSameCityColumnReady(this.db)
      ? new Set(((await this.db.query(`SELECT "superAgentId" FROM public.office_pickup_offer WHERE "sameCityDelivery" = true`).catch(() => [])) as any[]).map((r) => Number(r.superAgentId)))
      : new Set<number>();
    const originForMatch = pickupPoint ? { ...origin, latitude: pickupPoint.latitude, longitude: pickupPoint.longitude } : origin;
    const backed = sameCity ? new Map() : await this.transportBackedRates(from, to, weight);
    const offices = [] as any[];
    for (const o of officeRows) {
      const id = Number(o.id);
      const routes = rateRows.filter((r) => Number(r.superAgentId) === id && r.isActive !== false).map((r) => String(r.destinationCity));
      const reasons: string[] = [];
      if (o.status !== 'active') reasons.push(`Haiko hai (hali: ${o.status})`);
      if (o.isTrainingOffice) reasons.push('Ni ofisi ya mafunzo');
      const point = geoPoint(o.latitude, o.longitude);
      const km = point && pickupPoint ? kmBetween(point, pickupPoint) : null;
      if (!officeServesOrigin(o.city, originForMatch, { latitude: o.latitude, longitude: o.longitude })) {
        reasons.push(`Iko ${o.city || 'mji haujawekwa'}${km != null ? ` (km ${Math.round(km)})` : ''}, si ${from}`);
      }
      if (sameCity) {
        if (!sameCityIds.has(id)) reasons.push('Haijachagua kupeleka ndani ya mji');
      } else if (!routes.some((r) => rateServesDestination(r, destination)) && !backed.has(id)) {
        reasons.push(routes.length ? `Haina njia kwenda ${to} (inatuma: ${routes.join(', ')})` : 'Haijaweka mkoa wowote inaotuma ("Bei zangu")');
      }
      if (noParcels.has(id)) reasons.push('Imechagua mizigo mikubwa au kontena tu, si vifurushi');
      const rule = this.officePrices ? await this.officePrices.ruleFor(id).catch(() => null) : null;
      offices.push({ id, name: o.businessName, city: o.city, status: o.status, hasPoint: Boolean(point),
        distanceKm: km == null ? null : Math.round(km * 10) / 10, chargeMode: rule?.chargeMode ?? 'value (kawaida)',
        routes, ok: reasons.length === 0, reasons,
        note: backed.has(id) ? `Inatuma ${to} kupitia usafiri wake (${backed.get(id).via || 'msafirishaji'})` : null });
    }
    // The real answer, so the check and the customer's screen never disagree.
    const offers = await this.discover({ ...dto, weightKg: weight } as any).catch((e: any) => {
      notes.push(`Utafutaji ulishindwa: ${e?.message || e}`);
      return [] as LogisticsServiceOffer[];
    });
    return {
      trip: { from, to, sameCity, weightKg: weight, declaredValue: value > 0 ? value : null,
        origin: { region: origin.regionName, district: origin.districtName, point: pickupPoint },
        destination: { region: destination.regionName, district: destination.districtName } },
      found: offers.map((o: any) => ({ type: o.serviceType, name: o.name, price: o.price })),
      agents, offices, notes, radiusKm: { agent: radius, office: officeRadiusKm() },
    };
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