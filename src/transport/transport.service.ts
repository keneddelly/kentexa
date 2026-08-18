/**
 * TransportService — Core transport module logic
 * Place at: src/transport/transport.service.ts
 */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ReputationService } from '../reputation/reputation.service';
import { ReputationEventType } from '../reputation/entities/reputation-event.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TransportProvider,
  ProviderStatus,
  ConfirmMode,
  ProviderType,
} from './entities/transport-provider.entity';
import { TransportRoute, RouteType } from './entities/transport-route.entity';
import {
  ProviderAvailability,
  AvailabilityStatus,
} from './entities/provider-availability.entity';
import {
  TransportAssignment,
  AssignmentStatus,
} from './entities/transport-assignment.entity';
import { User, UserRole } from '../users/entities/user.entity';
import {
  ServiceAd,
  ServiceCategory,
  ServiceStatus,
  PriceType,
} from '../services/entities/service-ad.entity';
import { mergeActiveRole } from '../users/utils/merge-active-role.util';
import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';
import {
  CommerceProfileType,
  CommerceProfileStatus,
} from '../commerce-profiles/entities/commerce-profile.entity';
import { TzLocationService } from '../tz-location/tz-location.service';
import { Parcel, ParcelStatus, ParcelTracking } from '../super-agents/entities/parcel.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { Shipment, ShipmentStatus } from '../shipments/entities/shipment.entity';

@Injectable()
export class TransportService {
  constructor(
    @InjectRepository(TransportProvider)
    private providerRepo: Repository<TransportProvider>,
    @InjectRepository(TransportRoute)
    private routeRepo: Repository<TransportRoute>,
    @InjectRepository(ProviderAvailability)
    private availabilityRepo: Repository<ProviderAvailability>,
    @InjectRepository(TransportAssignment)
    private assignmentRepo: Repository<TransportAssignment>,
    @InjectRepository(ServiceAd) private serviceAdRepo: Repository<ServiceAd>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Parcel) private parcelRepo: Repository<Parcel>,
    @InjectRepository(ParcelTracking)
    private parcelTrackingRepo: Repository<ParcelTracking>,
    @InjectRepository(SuperAgent) private superAgentRepo: Repository<SuperAgent>,
    @InjectRepository(Shipment) private shipmentRepo: Repository<Shipment>,
    private readonly reputationService: ReputationService,
    private commerceProfiles: CommerceProfilesService,
    private readonly tzLocation: TzLocationService,
  ) {}

  // ── Safe, credential-free provider projection ────────────────────────────
  // Reused everywhere a provider is embedded in a response a non-owner
  // might see (public tracking, public availability search) — never
  // includes apiKey/webhookEnabled/contract fields/contactEmail/admin
  // notes. This is the single source of truth for "what's safe to show
  // about a provider publicly" so a future new public endpoint can't
  // reintroduce the same leak by hand-picking fields itself and missing one.
  private toSafeProvider(p: TransportProvider) {
    return {
      id: p.id,
      // Not sensitive — needed so a search/discovery result can actually
      // link to the provider's own public profile (CommerceProfile-
      // {userId}-transport) instead of only offering a WhatsApp/call
      // button with no way to see their real routes/details.
      userId: p.userId,
      name: p.name,
      type: p.type,
      logoUrl: p.logoUrl,
      rating: Number(p.rating) || 0,
      contactPhone: p.contactPhone,
      whatsappPhone: p.whatsappPhone,
      cities: p.cities,
    };
  }

  // Resolves the caller's own SuperAgent profile, or null if they don't
  // have one — never throws, since "not a super agent" is a legitimate
  // answer callers need to branch on (e.g. reject with a clear message)
  // rather than a 404/500.
  private async findCallerSuperAgent(userId: number): Promise<SuperAgent | null> {
    return this.superAgentRepo.findOne({ where: { user: { id: userId } } });
  }

  // Best-effort city → region resolution against the existing tz-location
  // search. Never throws, never blocks the caller — a route/shipment with
  // an unresolved region is exactly as usable as one with a plain string,
  // just without the FK for future location-aware features.
  private async resolveRegionId(city: string | null | undefined): Promise<number | null> {
    if (!city?.trim()) return null;
    try {
      const results = await this.tzLocation.search(city.trim());
      return results?.[0]?.regionId ?? null;
    } catch {
      return null;
    }
  }

  // ── REGISTRATION ──────────────────────────────────────────────────────────

  async register(
    user: User,
    dto: {
      name: string;
      type: string;
      contactPhone: string;
      whatsappPhone?: string;
      contactEmail?: string;
      registrationNumber?: string;
      description?: string;
      logoUrl?: string;
      defaultParcelCapacity?: number;
      defaultMaxWeightKg?: number;
    },
  ): Promise<TransportProvider> {
    // One provider per user
    const existing = await this.providerRepo.findOne({
      where: { userId: user.id },
    });
    if (existing)
      throw new BadRequestException('Una akaunti ya usafirishaji tayari');

    const provider = this.providerRepo.create({
      userId: user.id,
      name: dto.name,
      type: dto.type as any,
      contactPhone: dto.contactPhone,
      whatsappPhone: dto.whatsappPhone || null,
      contactEmail: dto.contactEmail || null,
      registrationNumber: dto.registrationNumber || null,
      description: dto.description || null,
      logoUrl: dto.logoUrl || null,
      defaultParcelCapacity: dto.defaultParcelCapacity || 10,
      defaultMaxWeightKg: dto.defaultMaxWeightKg || 100,
      status: ProviderStatus.PENDING,
      confirmMode: ['bus', 'courier'].includes(dto.type)
        ? ConfirmMode.AUTO
        : ConfirmMode.MANUAL,
    });
    const saved = await this.providerRepo.save(provider);
    // Auto-create a paused service ad (activates when admin verifies)
    await this.syncServiceAd(saved, false);

    try {
      await this.commerceProfiles.createProfile({
        ownerId: user.id,
        type: CommerceProfileType.TRANSPORT_PROVIDER,
        displayName: saved.name,
        usernameSeed: saved.name,
        photoUrl: saved.logoUrl,
        bio: saved.description,
        status: CommerceProfileStatus.PENDING,
        transportProviderId: saved.id,
      });
    } catch {}

    return saved;
  }

  async getMyProfile(userId: number): Promise<TransportProvider> {
    const p = await this.providerRepo.findOne({
      where: { userId },
      relations: { user: true },
    });
    if (!p) throw new NotFoundException('Transport account not found');
    return p;
  }

  // ── Public: provider info + active routes for CommerceProfile.js ─────────
  // Never exposes apiKey, webhookEnabled, contract/fee details.
  async findPublicByUserId(userId: number) {
    const p = await this.providerRepo.findOne({ where: { userId } });
    if (!p) return null;
    // Rejected/suspended providers stay fully hidden — nothing to show a
    // visitor. A PENDING provider (just registered, not yet admin-verified)
    // still gets a real profile: identity is real regardless of review
    // status, same as how a seller's business profile shows while their
    // application is pending. What's withheld is routes/trips, since those
    // represent bookable commitments no one should act on before the
    // provider is actually verified.
    const isVerified = [ProviderStatus.VERIFIED, ProviderStatus.ACTIVE].includes(
      p.status,
    );
    if (
      [ProviderStatus.REJECTED, ProviderStatus.SUSPENDED].includes(p.status)
    )
      return null;

    const routes = isVerified
      ? await this.routeRepo.find({
          where: { providerId: p.id, isActive: true },
        })
      : [];

    // Real upcoming departures, not just static route coverage — a visitor
    // should see WHEN the next trip actually leaves, per the spec's "never
    // hardcode route information into the profile UI" instruction. Same
    // 7-day OPEN-slot window as the provider's own getMyAvailability().
    const today = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const upcomingTrips = isVerified
      ? await this.availabilityRepo
          .createQueryBuilder('a')
          .leftJoinAndSelect('a.route', 'r')
          .where('a.providerId = :pid', { pid: p.id })
          .andWhere('a.status = :open', { open: AvailabilityStatus.OPEN })
          .andWhere('a.date >= :today', { today })
          .andWhere('a.date <= :end', { end })
          .orderBy('a.date', 'ASC')
          .addOrderBy('a.departureTime', 'ASC')
          .getMany()
      : [];

    return {
      name: p.name,
      type: p.type,
      status: p.status,
      isVerified,
      logoUrl: p.logoUrl,
      description: p.description,
      whatsappPhone: p.whatsappPhone,
      cities: p.cities,
      rating: Number(p.rating),
      completedAssignments: p.completedAssignments,
      routes: routes.map((r) => ({
        id: r.id,
        routeType: r.routeType,
        originCity: (r as any).originCity,
        destinationCity: (r as any).destinationCity,
        loopStops: (r as any).loopStops,
        coverageCity: (r as any).coverageCity,
        coverageWards: (r as any).coverageWards,
        pricePerKg: r.pricePerKg,
        fixedFee: r.fixedFee,
      })),
      upcomingTrips: upcomingTrips.map((a) => ({
        availabilityId: a.id,
        routeId: a.routeId,
        date: a.date,
        departureTime: a.departureTime,
        arrivalEstimate: a.arrivalEstimate,
        fromCity: a.fromCity || (a as any).route?.originCity || null,
        toCity: a.toCity || (a as any).route?.destinationCity || null,
        slotsAvailable: Math.max(0, a.totalSlots - a.usedSlots),
        capacityAvailableKg: Math.max(0, Number(a.totalCapacityKg) - Number(a.usedCapacityKg)),
      })),
    };
  }

  async updateProfile(
    userId: number,
    dto: Partial<TransportProvider>,
  ): Promise<TransportProvider> {
    const p = await this.getMyProfile(userId);
    // `cities` (declared coverage areas) was read everywhere — the public
    // profile, search results, RouteCoverageMap — but never once
    // writable: not here, not at registration. Every provider's coverage
    // list was permanently empty regardless of what they actually served.
    const allowed = [
      'name',
      'contactPhone',
      'whatsappPhone',
      'contactEmail',
      'description',
      'defaultParcelCapacity',
      'defaultMaxWeightKg',
      'logoUrl',
      'cities',
    ];
    for (const key of allowed) {
      if (dto[key] !== undefined) (p as any)[key] = (dto as any)[key];
    }
    const saved = await this.providerRepo.save(p);
    // Keep the single source of truth in sync — only contactPhone maps
    // cleanly to a User field; the business `name` isn't the same concept
    // as the person's own name, so that one stays provider-only.
    if (dto.contactPhone) {
      await this.userRepo.update(userId, { phone: dto.contactPhone });
    }
    return saved;
  }

  // ── ROUTES ────────────────────────────────────────────────────────────────

  async addRoute(
    userId: number,
    dto: {
      routeType: string;
      originCity?: string;
      destinationCity?: string;
      transitCities?: string[];
      loopStops?: string[];
      coverageWards?: string[];
      coverageCity?: string;
      pricePerKg?: number;
      fixedFee?: number;
      estimatedHours?: number;
      notes?: string;
    },
  ): Promise<TransportRoute> {
    const provider = await this.getMyProfile(userId);
    // ACTIVE is the legacy status for already-onboarded Phase 2
    // API-integrated providers and is treated as equally good-to-act-on
    // everywhere else (see the isVerified check above) — this alone
    // excluded them from adding routes at all.
    if (
      ![ProviderStatus.VERIFIED, ProviderStatus.ACTIVE].includes(
        provider.status,
      )
    ) {
      throw new ForbiddenException('Akaunti yako haijahakikiwa bado');
    }
    const [originRegionId, destinationRegionId] = await Promise.all([
      this.resolveRegionId(dto.originCity),
      this.resolveRegionId(dto.destinationCity),
    ]);
    const route = await this.routeRepo.save(
      this.routeRepo.create({
        providerId: provider.id,
        routeType: dto.routeType as RouteType,
        originCity: dto.originCity || null,
        originRegionId,
        destinationCity: dto.destinationCity || null,
        destinationRegionId,
        transitCities: dto.transitCities || null,
        loopStops: dto.loopStops || null,
        coverageWards: dto.coverageWards || null,
        coverageCity: dto.coverageCity || null,
        pricePerKg: dto.pricePerKg || 0,
        fixedFee: dto.fixedFee || 0,
        estimatedHours: dto.estimatedHours || null,
        notes: dto.notes || null,
        isActive: true,
      }),
    );

    // Update service ad coverage city from route
    try {
      const city = dto.originCity || dto.coverageCity || null;
      if (city) {
        const ad = await this.serviceAdRepo.findOne({
          where: {
            providerId: provider.userId ?? undefined,
            category: ServiceCategory.USAFIRISHAJI,
          },
        });
        if (ad) {
          ad.coverageCity = city;
          await this.serviceAdRepo.save(ad);
        }
      }
    } catch {
      /* non-critical */
    }

    return route;
  }

  async getMyRoutes(userId: number): Promise<TransportRoute[]> {
    const p = await this.getMyProfile(userId);
    return this.routeRepo.find({ where: { providerId: p.id, isActive: true } });
  }

  async updateRoute(
    userId: number,
    routeId: number,
    dto: any,
  ): Promise<TransportRoute> {
    const p = await this.getMyProfile(userId);
    const route = await this.routeRepo.findOne({
      where: { id: routeId, providerId: p.id },
    });
    if (!route) throw new NotFoundException('Njia haijapatikana');
    // Explicit whitelist — the previous Object.assign(route, dto) let an
    // owner smuggle a providerId (or any other column) into the same
    // request that was only supposed to let them edit their own route,
    // silently reassigning/vandalizing it. `providerId`/`id` are never
    // editable here regardless of what the caller sends.
    const editable = [
      'routeType',
      'originCity',
      'destinationCity',
      'transitCities',
      'loopStops',
      'coverageWards',
      'coverageCity',
      'pricePerKg',
      'fixedFee',
      'estimatedHours',
      'isActive',
      'notes',
    ];
    for (const key of editable) {
      if (dto[key] !== undefined) (route as any)[key] = dto[key];
    }
    return this.routeRepo.save(route);
  }

  // ── AVAILABILITY ─────────────────────────────────────────────────────────

  async publishAvailability(
    userId: number,
    dto: {
      routeId?: number;
      date: string;
      departureTime?: string;
      arrivalEstimate?: string;
      bookingDeadline?: string;
      totalSlots: number;
      totalCapacityKg?: number;
      fromCity?: string;
      toCity?: string;
      notes?: string;
    },
  ): Promise<ProviderAvailability> {
    const p = await this.getMyProfile(userId);
    if (![ProviderStatus.VERIFIED, ProviderStatus.ACTIVE].includes(p.status)) {
      throw new ForbiddenException('Akaunti yako haijahakikiwa bado');
    }
    // Check no duplicate for same route+date
    if (dto.routeId) {
      const dup = await this.availabilityRepo.findOne({
        where: { providerId: p.id, routeId: dto.routeId, date: dto.date },
      });
      if (dup)
        throw new BadRequestException('Umeshaweka upatikanaji kwa tarehe hii');
    }
    return this.availabilityRepo.save(
      this.availabilityRepo.create({
        providerId: p.id,
        routeId: dto.routeId || null,
        date: dto.date,
        departureTime: dto.departureTime || null,
        arrivalEstimate: dto.arrivalEstimate || null,
        bookingDeadline: dto.bookingDeadline || null,
        totalSlots: dto.totalSlots,
        usedSlots: 0,
        totalCapacityKg: dto.totalCapacityKg || p.defaultMaxWeightKg || 0,
        usedCapacityKg: 0,
        fromCity: dto.fromCity || null,
        toCity: dto.toCity || null,
        notes: dto.notes || null,
        status: AvailabilityStatus.OPEN,
      }),
    );
  }

  async getMyAvailability(
    userId: number,
    days = 7,
  ): Promise<ProviderAvailability[]> {
    const p = await this.getMyProfile(userId);
    const today = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + days * 86400000)
      .toISOString()
      .slice(0, 10);
    return this.availabilityRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.route', 'r')
      .where('a.providerId = :pid', { pid: p.id })
      .andWhere('a.date >= :today', { today })
      .andWhere('a.date <= :end', { end })
      .orderBy('a.date', 'ASC')
      .addOrderBy('a.departureTime', 'ASC')
      .getMany();
  }

  async updateAvailabilityStatus(
    userId: number,
    availId: number,
    status: AvailabilityStatus,
  ): Promise<ProviderAvailability> {
    const p = await this.getMyProfile(userId);
    const a = await this.availabilityRepo.findOne({
      where: { id: availId, providerId: p.id },
    });
    if (!a) throw new NotFoundException('Haijapatikana');
    a.status = status;
    return this.availabilityRepo.save(a);
  }

  // ── SUPER AGENT: FIND TRANSPORT ───────────────────────────────────────────

  /**
   * Super agent calls this when assigning transport to a shipment.
   * Returns: available slots TODAY + TOMORROW + all verified providers on that route.
   *
   * weightKg, when given, hard-filters out anything that structurally can't
   * carry the load — a bus/boda/courier registered for ~100kg has no
   * business being offered for a 2,000kg+ shipment just because it covers
   * the right cities. Omit it (or pass 0) to skip capacity filtering
   * entirely, e.g. for a first browse before the requester knows weight.
   */
  async findAvailableForRoute(
    fromCity: string,
    toCity: string,
    weightKg = 0,
  ): Promise<{
    published: ProviderAvailability[];
    providers: TransportProvider[];
  }> {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    // Published availability for this route (open slots, today + tomorrow)
    // City matching must work BOTH directions: a provider might store a
    // short free-text city ("Dar") while a caller searches with the full
    // canonical name from tz-location ("Dar es Salaam"), or vice versa.
    // "Dar" LIKE '%Dar es Salaam%' is false (the short form never contains
    // the long one) — that one-directional check was silently hiding real,
    // verified trips/routes the moment either side used a different
    // abbreviation than the other. Checking both containment directions
    // fixes it without requiring every existing free-text city value to be
    // rewritten.
    const cityMatch = (column: string, param: string) =>
      `(LOWER(${column}) LIKE LOWER(:${param}) OR LOWER(:${param}Raw) LIKE '%' || LOWER(${column}) || '%')`;

    const publishedQuery = this.availabilityRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.provider', 'p')
      .leftJoinAndSelect('a.route', 'r')
      .where('a.status = :open', { open: AvailabilityStatus.OPEN })
      .andWhere('a.date IN (:...dates)', { dates: [today, tomorrow] })
      .andWhere('a.usedSlots < a.totalSlots')
      .andWhere(
        // Origin/destination-city columns only cover intercity routes — a
        // last-mile route's coverage lives in coverageWards/coverageCity
        // instead, and a local-loop van's in loopStops. Without matching
        // those too, a same-city search like "Kariakoo to Bunju" (both
        // wards inside Dar es Salaam) never found the boda/van providers
        // who actually cover exactly that — only real intercity routes
        // ever matched at all.
        `(${cityMatch('a.fromCity', 'from')} OR ${cityMatch('r.originCity', 'from')} OR ${cityMatch('r.coverageWards', 'from')} OR ${cityMatch('r.loopStops', 'from')} OR ${cityMatch('r.coverageCity', 'from')})`,
        { from: `%${fromCity}%`, fromRaw: fromCity },
      )
      .andWhere(
        `(${cityMatch('a.toCity', 'to')} OR ${cityMatch('r.destinationCity', 'to')} OR ${cityMatch('r.coverageWards', 'to')} OR ${cityMatch('r.loopStops', 'to')} OR ${cityMatch('r.coverageCity', 'to')})`,
        { to: `%${toCity}%`, toRaw: toCity },
      );
    if (weightKg > 0) {
      publishedQuery.andWhere(
        '(a.totalCapacityKg - a.usedCapacityKg) >= :weightKg',
        { weightKg },
      );
    }
    const published = await publishedQuery
      .orderBy('a.date', 'ASC')
      .addOrderBy('a.departureTime', 'ASC')
      .getMany();

    // All verified providers covering this route (even without published availability)
    const providersQuery = this.providerRepo
      .createQueryBuilder('p')
      .innerJoin('p.user', 'u')
      .leftJoin(
        'transport_route',
        'r',
        'r.providerId = p.id AND r.isActive = true',
      )
      .where('p.status IN (:...verifiedStatuses)', {
        verifiedStatuses: [ProviderStatus.VERIFIED, ProviderStatus.ACTIVE],
      })
      .andWhere(
        // Same last-mile/local-loop coverage extension as publishedQuery above.
        `(${cityMatch('r.originCity', 'from')} OR ${cityMatch('r.destinationCity', 'from')} OR ${cityMatch('r.coverageWards', 'from')} OR ${cityMatch('r.loopStops', 'from')} OR ${cityMatch('r.coverageCity', 'from')})`,
        { from: `%${fromCity}%`, fromRaw: fromCity },
      )
      .andWhere(
        `(${cityMatch('r.destinationCity', 'to')} OR ${cityMatch('r.originCity', 'to')} OR ${cityMatch('r.coverageWards', 'to')} OR ${cityMatch('r.loopStops', 'to')} OR ${cityMatch('r.coverageCity', 'to')})`,
        { to: `%${toCity}%`, toRaw: toCity },
      );
    if (weightKg > 0) {
      // 0 means "not specified" on registration, not "zero capacity" —
      // never exclude a provider who simply never declared a max.
      providersQuery.andWhere(
        '(p.defaultMaxWeightKg = 0 OR p.defaultMaxWeightKg >= :weightKg)',
        { weightKg },
      );
    }
    const providers = await providersQuery.orderBy('p.rating', 'DESC').getMany();

    return { published, providers };
  }

  // ── PUBLIC: safe availability discovery ──────────────────────────────────
  // GET /transport/available is genuinely called by a public page
  // (RouteCoverageMap.js) pre-login, so it stays public rather than being
  // locked behind auth — but it must never again return the raw
  // TransportProvider entity (apiKey, contract fields, contactEmail, admin
  // notes) embedded in every result the way findAvailableForRoute's
  // internal shape does. Same underlying query, safe projection on top.
  async findPublicAvailabilityForRoute(fromCity: string, toCity: string) {
    const { published, providers } = await this.findAvailableForRoute(
      fromCity,
      toCity,
    );
    return {
      trips: published.map((a) => ({
        availabilityId: a.id,
        provider: this.toSafeProvider((a as any).provider),
        fromCity: a.fromCity || (a as any).route?.originCity || null,
        toCity: a.toCity || (a as any).route?.destinationCity || null,
        date: a.date,
        departureTime: a.departureTime,
        arrivalEstimate: a.arrivalEstimate,
        slotsAvailable: Math.max(0, a.totalSlots - a.usedSlots),
        capacityAvailableKg: Math.max(
          0,
          Number(a.totalCapacityKg) - Number(a.usedCapacityKg),
        ),
        pricePerKg: (a as any).route?.pricePerKg ?? null,
        fixedFee: (a as any).route?.fixedFee ?? null,
      })),
      providers: providers.map((p) => this.toSafeProvider(p)),
    };
  }

  // ── PUBLIC CONSUMER SEARCH ───────────────────────────────────────────────
  // Unlike findAvailableForRoute (super-agent dispatch — internal slot/
  // capacity data), this returns a lean, consumer-safe card shape for the
  // AI front door's "transport" domain. Reuses the same verified-providers
  // query rather than duplicating it.
  async findPublicProvidersForRoute(fromCity: string, toCity: string) {
    const { providers } = await this.findAvailableForRoute(fromCity, toCity);
    return providers.map((p) => this.toSafeProvider(p));
  }

  // ── TRANSPORT ASSIGNMENT ──────────────────────────────────────────────────

  // Extracted so ShipmentsService can reserve capacity against a slot at
  // shipment-request time too — a shipment against a slot is real demand
  // whether or not a formal TransportAssignment has been created yet.
  async reserveCapacity(availabilityId: number, weightKg: number): Promise<void> {
    const avail = await this.availabilityRepo.findOne({
      where: { id: availabilityId },
    });
    if (avail && avail.usedSlots < avail.totalSlots) {
      avail.usedSlots++;
      avail.usedCapacityKg += weightKg || 1;
      if (avail.usedSlots >= avail.totalSlots)
        avail.status = AvailabilityStatus.FULL;
      await this.availabilityRepo.save(avail);
    }
  }

  // Counterpart to reserveCapacity — an assignment cancelled/declined
  // before departure must give its slot back, or a provider's real
  // capacity silently shrinks every time a booking falls through.
  async releaseCapacity(availabilityId: number, weightKg: number): Promise<void> {
    const avail = await this.availabilityRepo.findOne({
      where: { id: availabilityId },
    });
    if (!avail) return;
    avail.usedSlots = Math.max(0, avail.usedSlots - 1);
    avail.usedCapacityKg = Math.max(0, Number(avail.usedCapacityKg) - (weightKg || 1));
    if (avail.status === AvailabilityStatus.FULL && avail.usedSlots < avail.totalSlots) {
      avail.status = AvailabilityStatus.OPEN;
    }
    await this.availabilityRepo.save(avail);
  }

  // Only these transitions are reachable via updateAssignmentStatus() —
  // accept/decline stay in respondToAssignment(). Cancellation is only
  // allowed before the parcel has physically departed; nothing can jump
  // straight to COMPLETED or move backwards.
  private static readonly NEXT_STATUS: Partial<
    Record<AssignmentStatus, AssignmentStatus[]>
  > = {
    [AssignmentStatus.ACCEPTED]: [
      AssignmentStatus.COLLECTED,
      AssignmentStatus.CANCELLED,
    ],
    [AssignmentStatus.COLLECTED]: [
      AssignmentStatus.DEPARTED,
      AssignmentStatus.CANCELLED,
    ],
    [AssignmentStatus.DEPARTED]: [AssignmentStatus.ARRIVED],
    [AssignmentStatus.ARRIVED]: [AssignmentStatus.COMPLETED],
  };

  // A transport leg reaching one of these states is real evidence about
  // where the physical parcel actually is — Kentexa (not the provider
  // directly) translates that into the Parcel's own lifecycle. COMPLETED
  // is deliberately absent: the entity's own status comment says it means
  // "handed to destination super agent OR buyer" — two different real
  // events collapsed into one value — so it is never auto-translated;
  // the existing Super Agent hub-receive / local-agent-delivered actions
  // remain the only things allowed to advance a Parcel that far.
  private static readonly PARCEL_SYNC: Partial<
    Record<AssignmentStatus, ParcelStatus>
  > = {
    [AssignmentStatus.COLLECTED]: ParcelStatus.DISPATCHED,
    [AssignmentStatus.DEPARTED]: ParcelStatus.IN_TRANSIT,
    [AssignmentStatus.ARRIVED]: ParcelStatus.ARRIVED_AT_HUB,
  };

  // A Parcel already resolved one way or another shouldn't be dragged
  // backwards by a transport event arriving late/out of order.
  private static readonly PARCEL_SYNC_BLOCKED = new Set([
    ParcelStatus.DELIVERED,
    ParcelStatus.SELF_PICKUP,
    ParcelStatus.RETURNED,
    ParcelStatus.DISPUTED,
  ]);

  // Best-effort mirror onto the standalone Shipment a Parcel may have
  // originated from — so a shipment requester sees real progress without
  // needing to know their parcel is also, internally, a Parcel. Never
  // blocks the transport-status update itself if it fails.
  private static readonly SHIPMENT_SYNC: Partial<
    Record<ParcelStatus, ShipmentStatus>
  > = {
    [ParcelStatus.DISPATCHED]: ShipmentStatus.COLLECTED,
    [ParcelStatus.IN_TRANSIT]: ShipmentStatus.IN_TRANSIT,
    [ParcelStatus.ARRIVED_AT_HUB]: ShipmentStatus.IN_TRANSIT,
    [ParcelStatus.DELIVERED]: ShipmentStatus.DELIVERED,
    [ParcelStatus.SELF_PICKUP]: ShipmentStatus.DELIVERED,
  };

  private async syncParcelFromAssignment(
    a: TransportAssignment,
    newStatus: AssignmentStatus,
  ): Promise<void> {
    const parcelId = a.parcelRefId || a.parcelId;
    const targetParcelStatus = TransportService.PARCEL_SYNC[newStatus];
    if (!parcelId || !targetParcelStatus) return;
    try {
      const parcel = await this.parcelRepo.findOne({ where: { id: parcelId } });
      if (!parcel || TransportService.PARCEL_SYNC_BLOCKED.has(parcel.status)) return;

      await this.parcelRepo.update(parcel.id, { status: targetParcelStatus });
      await this.parcelTrackingRepo.save(
        this.parcelTrackingRepo.create({
          parcel,
          status: targetParcelStatus,
          city: newStatus === AssignmentStatus.ARRIVED ? a.toCity : a.fromCity,
          note: `Auto-synced from transport assignment #${a.id}: ${newStatus}`,
          updatedBy: 'Kentexa',
          handlerType: 'system',
        } as any),
      );

      const shipmentId = a.shipmentRefId || (parcel as any).shipmentId;
      const shipmentStatus = TransportService.SHIPMENT_SYNC[targetParcelStatus];
      if (shipmentId && shipmentStatus) {
        await this.shipmentRepo.update(shipmentId, { status: shipmentStatus });
      }
    } catch {
      /* non-fatal — the transport status update itself already succeeded */
    }
  }

  async createAssignment(
    caller: User,
    dto: {
      parcelId?: number;
      trackingNumber?: string;
      providerId: number;
      availabilityId?: number;
      parcelCount?: number;
      weightKg?: number;
      agreedPrice?: number;
      scheduledDeparture?: string;
      superAgentNotes?: string;
    },
  ): Promise<TransportAssignment> {
    // Only an active Super Agent may create an assignment, and only for a
    // parcel their own hub actually holds — never trust a bare "I am a
    // super agent, trust my ids" claim from the client.
    const superAgent = await this.findCallerSuperAgent(caller.id);
    if (!superAgent) {
      throw new ForbiddenException(
        'Only a Super Agent can create a transport assignment',
      );
    }

    if (!dto.parcelId && !dto.trackingNumber) {
      throw new BadRequestException('parcelId or trackingNumber is required');
    }
    const parcel = await this.parcelRepo.findOne({
      where: dto.parcelId ? { id: dto.parcelId } : { trackingNumber: dto.trackingNumber },
      relations: { superAgent: true, destinationSuperAgent: true, order: true, shipment: true },
    });
    if (!parcel) throw new NotFoundException('Parcel not found');
    const ownsParcel =
      parcel.superAgent?.id === superAgent.id ||
      parcel.destinationSuperAgent?.id === superAgent.id;
    if (!ownsParcel) {
      throw new ForbiddenException(
        "You don't have authority over this parcel",
      );
    }

    const provider = await this.providerRepo.findOne({
      where: { id: dto.providerId },
    });
    if (!provider) throw new NotFoundException('Msafirishaji hajapatikana');
    if (
      ![ProviderStatus.VERIFIED, ProviderStatus.ACTIVE].includes(
        provider.status,
      )
    ) {
      throw new BadRequestException('Msafirishaji huyu hajakaguliwa bado');
    }

    // If a specific slot was chosen, it must actually belong to the
    // selected provider and still have room — pairing an unrelated
    // availabilityId with any providerId used to silently deplete a
    // stranger's capacity with no relationship check at all.
    if (dto.availabilityId) {
      const availability = await this.availabilityRepo.findOne({
        where: { id: dto.availabilityId },
      });
      if (!availability) {
        throw new NotFoundException('Availability slot not found');
      }
      if (availability.providerId !== dto.providerId) {
        throw new BadRequestException(
          "That availability slot doesn't belong to the selected provider",
        );
      }
      if (
        availability.status !== AvailabilityStatus.OPEN ||
        availability.usedSlots >= availability.totalSlots
      ) {
        throw new BadRequestException('That slot is no longer available');
      }
    }

    // Auto-confirm large providers, manual for small
    const isAutoConfirm = provider.confirmMode === ConfirmMode.AUTO;

    if (dto.availabilityId) {
      await this.reserveCapacity(dto.availabilityId, dto.weightKg || 1);
    }

    // orderId/shipmentId are never taken from the client — always derived
    // from the parcel that was just validated above, so they can't be
    // spoofed independently of a legitimate parcelId.
    const assignment = await this.assignmentRepo.save(
      this.assignmentRepo.create({
        trackingNumber: parcel.trackingNumber || null,
        orderId: parcel.order?.id || null,
        parcelId: parcel.id,
        shipmentId: (parcel as any).shipment?.id || null,
        parcelRefId: parcel.id,
        orderRefId: parcel.order?.id || null,
        shipmentRefId: (parcel as any).shipment?.id || null,
        assignedById: caller.id,
        providerId: dto.providerId,
        availabilityId: dto.availabilityId || null,
        fromCity: parcel.originCity,
        toCity: parcel.destinationCity,
        parcelCount: dto.parcelCount || 1,
        weightKg: dto.weightKg || Number(parcel.weightKg) || 0,
        agreedPrice: dto.agreedPrice || null,
        scheduledDeparture: dto.scheduledDeparture || null,
        superAgentNotes: dto.superAgentNotes || null,
        status: isAutoConfirm
          ? AssignmentStatus.ACCEPTED
          : AssignmentStatus.PENDING,
        acceptedAt: isAutoConfirm ? new Date() : null,
      }),
    );

    // Update provider stats
    await this.providerRepo.update(provider.id, {
      totalAssignments: () => 'totalAssignments + 1',
    });

    return assignment;
  }

  // Provider responds to assignment
  async respondToAssignment(
    userId: number,
    assignmentId: number,
    accept: boolean,
    declineReason?: string,
  ) {
    const provider = await this.getMyProfile(userId);
    const assignment = await this.assignmentRepo.findOne({
      where: {
        id: assignmentId,
        providerId: provider.id,
        status: AssignmentStatus.PENDING,
      },
    });
    if (!assignment) throw new NotFoundException('Mgawo haukupatikana');

    assignment.status = accept
      ? AssignmentStatus.ACCEPTED
      : AssignmentStatus.DECLINED;
    assignment.acceptedAt = accept ? new Date() : null;
    assignment.declineReason = declineReason || null;
    const saved = await this.assignmentRepo.save(assignment);

    if (!accept && assignment.availabilityId) {
      await this.releaseCapacity(assignment.availabilityId, Number(assignment.weightKg) || 1);
    }
    return saved;
  }

  // Update assignment status (collected/departed/arrived/completed/cancelled)
  // with proof. Caller must be either the assigned provider, or the Super
  // Agent who created the assignment — anyone else is rejected outright.
  async updateAssignmentStatus(
    caller: User,
    assignmentId: number,
    dto: {
      status: AssignmentStatus;
      proofUrl?: string;
      notes?: string;
    },
  ) {
    const a = await this.assignmentRepo.findOne({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Mgawo haukupatikana');

    const providerProfile = await this.providerRepo.findOne({
      where: { user: { id: caller.id } },
    });
    const isOwningProvider = !!providerProfile && providerProfile.id === a.providerId;
    const isCreatingSuperAgent =
      a.assignedById === caller.id && !!(await this.findCallerSuperAgent(caller.id));
    const isAdmin = [UserRole.ADMIN, UserRole.MANAGER].includes(caller.role);
    if (!isOwningProvider && !isCreatingSuperAgent && !isAdmin) {
      throw new ForbiddenException('Not authorized to update this transport assignment');
    }

    const allowedNext = TransportService.NEXT_STATUS[a.status] || [];
    if (!isAdmin && !allowedNext.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot move assignment from "${a.status}" to "${dto.status}"`,
      );
    }

    const now = new Date();
    const previousStatus = a.status;
    a.status = dto.status;
    if (dto.notes) a.providerNotes = dto.notes;

    switch (dto.status) {
      case AssignmentStatus.COLLECTED:
        a.collectedAt = now;
        a.collectionProofUrl = dto.proofUrl || null;
        break;
      case AssignmentStatus.DEPARTED:
        a.departedAt = now;
        a.departureProofUrl = dto.proofUrl || null;
        break;
      case AssignmentStatus.ARRIVED:
        a.arrivedAt = now;
        a.arrivalProofUrl = dto.proofUrl || null;
        break;
      case AssignmentStatus.CANCELLED:
        if (a.availabilityId && previousStatus !== AssignmentStatus.DEPARTED) {
          await this.releaseCapacity(a.availabilityId, Number(a.weightKg) || 1);
        }
        break;
      case AssignmentStatus.COMPLETED:
        a.completedAt = now;
        await this.providerRepo.update(a.providerId, {
          completedAssignments: () => 'completedAssignments + 1',
        });
        // Award reputation for completed transport assignment
        if (providerProfile?.userId) {
          this.reputationService
            .award(providerProfile.userId, ReputationEventType.TRANSPORT_COMPLETED, {
              sourceEntityType: 'transport_assignment',
              sourceEntityId: a.id,
            })
            .catch(() => {});
        }
        break;
    }
    const saved = await this.assignmentRepo.save(a);

    // Kentexa (not the transport provider directly) turns a real transport
    // event into the Parcel's own lifecycle — see PARCEL_SYNC's comment for
    // exactly which transitions apply and why COMPLETED is excluded.
    await this.syncParcelFromAssignment(saved, dto.status);

    return saved;
  }

  // Get assignments for a provider
  async getMyAssignments(
    userId: number,
    status?: string,
  ): Promise<TransportAssignment[]> {
    const p = await this.getMyProfile(userId);
    const q = this.assignmentRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.assignedBy', 'sa')
      .where('a.providerId = :pid', { pid: p.id });
    if (status) q.andWhere('a.status = :status', { status });
    return q.orderBy('a.createdAt', 'DESC').take(50).getMany();
  }

  // Get assignments for a tracking number — PUBLIC, unauthenticated. Used
  // to leak the full TransportAssignment + embedded TransportProvider
  // entity (apiKey included — the exact bearer credential the webhook
  // controller trusts, i.e. this was a full impersonation path for
  // anyone who could guess a tracking number). Now returns a hand-picked,
  // credential-free shape only.
  async getAssignmentByTracking(trackingNumber: string) {
    const rows = await this.assignmentRepo.find({
      where: { trackingNumber },
      relations: { provider: true },
      order: { createdAt: 'DESC' },
    });
    return rows.map((a) => ({
      status: a.status,
      fromCity: a.fromCity,
      toCity: a.toCity,
      provider: a.provider ? this.toSafeProvider(a.provider) : null,
      scheduledDeparture: a.scheduledDeparture,
      collectedAt: a.collectedAt,
      collectionProofUrl: a.collectionProofUrl,
      departedAt: a.departedAt,
      departureProofUrl: a.departureProofUrl,
      arrivedAt: a.arrivedAt,
      arrivalProofUrl: a.arrivalProofUrl,
      completedAt: a.completedAt,
      parcelCount: a.parcelCount,
      weightKg: a.weightKg,
      createdAt: a.createdAt,
    }));
  }

  // ── ADMIN ─────────────────────────────────────────────────────────────────

  async adminGetAll(status?: string): Promise<TransportProvider[]> {
    const where: any = status ? { status } : {};
    return this.providerRepo.find({
      where,
      relations: { user: true },
      order: { createdAt: 'DESC' },
    });
  }

  // ── Transport → Service marketplace link ─────────────────────────────────

  private transportTypeToSubcategory(type: string): string {
    const map: Record<string, string> = {
      bus: 'Basi la Abiria',
      van: 'Van / Gari Dogo',
      courier: 'Courier / Barua Haraka',
      truck: 'Lori / Mizigo Mizito',
      boda: 'Boda Boda / Pikipiki',
    };
    return map[type] || 'Usafirishaji';
  }

  private async syncServiceAd(
    provider: TransportProvider,
    activate: boolean,
  ): Promise<void> {
    try {
      // Find existing linked service ad
      const ad = await this.serviceAdRepo.findOne({
        where: {
          providerId: provider.userId ?? undefined,
          category: ServiceCategory.USAFIRISHAJI,
        },
      });

      const title = `${provider.name} — ${this.transportTypeToSubcategory(provider.type)}`;
      const desc =
        provider.description ||
        `${provider.name} inatoa huduma ya usafirishaji. Wasiliana nasi kwa maelezo zaidi.`;

      if (ad) {
        // Update existing
        ad.title = title;
        ad.description = desc;
        ad.status = activate ? ServiceStatus.ACTIVE : ServiceStatus.PAUSED;
        ad.isVerified = activate;
        ad.whatsappPhone = provider.whatsappPhone || provider.contactPhone;
        await this.serviceAdRepo.save(ad);
      } else if (provider.userId) {
        // Create new
        await this.serviceAdRepo.save(
          this.serviceAdRepo.create({
            providerId: provider.userId,
            title,
            description: desc,
            category: ServiceCategory.USAFIRISHAJI,
            subcategory: this.transportTypeToSubcategory(provider.type),
            priceType: PriceType.NEGOTIATE,
            price: 0,
            coverageCity: (provider as any).cities?.[0] || 'Tanzania',
            isAvailableNow: activate,
            isAvailableForBooking: activate,
            isVerified: activate,
            whatsappPhone: provider.whatsappPhone || provider.contactPhone,
            status: activate ? ServiceStatus.ACTIVE : ServiceStatus.PAUSED,
          }),
        );
      }
    } catch (err) {
      // Non-critical — don't fail transport registration if service ad fails
      console.warn(
        'Failed to sync transport provider to service marketplace:',
        err?.message,
      );
    }
  }

  async adminVerify(
    id: number,
    approve: boolean,
    reason?: string,
  ): Promise<TransportProvider> {
    const p = await this.providerRepo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Msafirishaji hajapatikana');
    p.status = approve ? ProviderStatus.VERIFIED : ProviderStatus.REJECTED;
    p.verifiedAt = approve ? new Date() : null;
    p.rejectionReason = reason || null;
    const saved = await this.providerRepo.save(p);
    // Sync to service marketplace
    await this.syncServiceAd(saved, approve);
    if (approve && p.userId) {
      const user = await this.userRepo.findOne({ where: { id: p.userId } });
      if (user) {
        await this.userRepo.update(p.userId, {
          role: UserRole.TRANSPORT_PROVIDER,
          activeRoles: mergeActiveRole(user.activeRoles, 'transport_provider'),
        });
      }
    }
    await this.commerceProfiles
      .syncStatusByLink(
        'transportProviderId',
        p.id,
        approve ? CommerceProfileStatus.ACTIVE : CommerceProfileStatus.REJECTED,
      )
      .catch(() => {});
    return saved;
  }

  async adminGetAssignments(filters: {
    providerId?: number;
    status?: string;
    fromCity?: string;
    toCity?: string;
  }): Promise<TransportAssignment[]> {
    const q = this.assignmentRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.provider', 'p')
      .leftJoinAndSelect('a.assignedBy', 'sa');
    if (filters.providerId)
      q.andWhere('a.providerId = :pid', { pid: filters.providerId });
    if (filters.status) q.andWhere('a.status = :st', { st: filters.status });
    if (filters.fromCity)
      q.andWhere('LOWER(a.fromCity) LIKE LOWER(:fc)', {
        fc: `%${filters.fromCity}%`,
      });
    if (filters.toCity)
      q.andWhere('LOWER(a.toCity) LIKE LOWER(:tc)', {
        tc: `%${filters.toCity}%`,
      });
    return q.orderBy('a.createdAt', 'DESC').take(100).getMany();
  }
}
