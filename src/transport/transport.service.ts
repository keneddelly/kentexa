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
    private readonly reputationService: ReputationService,
    private commerceProfiles: CommerceProfilesService,
    private readonly tzLocation: TzLocationService,
  ) {}

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
    if (
      !p ||
      ![ProviderStatus.VERIFIED, ProviderStatus.ACTIVE].includes(p.status)
    )
      return null;

    const routes = await this.routeRepo.find({
      where: { providerId: p.id, isActive: true },
    });

    // Real upcoming departures, not just static route coverage — a visitor
    // should see WHEN the next trip actually leaves, per the spec's "never
    // hardcode route information into the profile UI" instruction. Same
    // 7-day OPEN-slot window as the provider's own getMyAvailability().
    const today = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const upcomingTrips = await this.availabilityRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.route', 'r')
      .where('a.providerId = :pid', { pid: p.id })
      .andWhere('a.status = :open', { open: AvailabilityStatus.OPEN })
      .andWhere('a.date >= :today', { today })
      .andWhere('a.date <= :end', { end })
      .orderBy('a.date', 'ASC')
      .addOrderBy('a.departureTime', 'ASC')
      .getMany();

    return {
      name: p.name,
      type: p.type,
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
    const allowed = [
      'name',
      'contactPhone',
      'whatsappPhone',
      'contactEmail',
      'description',
      'defaultParcelCapacity',
      'defaultMaxWeightKg',
      'logoUrl',
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
    if (provider.status !== ProviderStatus.VERIFIED) {
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
    Object.assign(route, dto);
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
    if (p.status !== ProviderStatus.VERIFIED) {
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
   */
  async findAvailableForRoute(
    fromCity: string,
    toCity: string,
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

    const published = await this.availabilityRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.provider', 'p')
      .leftJoinAndSelect('a.route', 'r')
      .where('a.status = :open', { open: AvailabilityStatus.OPEN })
      .andWhere('a.date IN (:...dates)', { dates: [today, tomorrow] })
      .andWhere('a.usedSlots < a.totalSlots')
      .andWhere(
        `(${cityMatch('a.fromCity', 'from')} OR ${cityMatch('r.originCity', 'from')})`,
        { from: `%${fromCity}%`, fromRaw: fromCity },
      )
      .andWhere(
        `(${cityMatch('a.toCity', 'to')} OR ${cityMatch('r.destinationCity', 'to')})`,
        { to: `%${toCity}%`, toRaw: toCity },
      )
      .orderBy('a.date', 'ASC')
      .addOrderBy('a.departureTime', 'ASC')
      .getMany();

    // All verified providers covering this route (even without published availability)
    const providers = await this.providerRepo
      .createQueryBuilder('p')
      .innerJoin('p.user', 'u')
      .leftJoin(
        'transport_route',
        'r',
        'r.providerId = p.id AND r.isActive = true',
      )
      .where('p.status = :verified', { verified: ProviderStatus.VERIFIED })
      .andWhere(
        `(${cityMatch('r.originCity', 'from')} OR ${cityMatch('r.destinationCity', 'from')})`,
        { from: `%${fromCity}%`, fromRaw: fromCity },
      )
      .andWhere(
        `(${cityMatch('r.destinationCity', 'to')} OR ${cityMatch('r.originCity', 'to')})`,
        { to: `%${toCity}%`, toRaw: toCity },
      )
      .orderBy('p.rating', 'DESC')
      .getMany();

    return { published, providers };
  }

  // ── PUBLIC CONSUMER SEARCH ───────────────────────────────────────────────
  // Unlike findAvailableForRoute (super-agent dispatch — internal slot/
  // capacity data), this returns a lean, consumer-safe card shape for the
  // AI front door's "transport" domain. Reuses the same verified-providers
  // query rather than duplicating it.
  async findPublicProvidersForRoute(
    fromCity: string,
    toCity: string,
  ): Promise<
    {
      id: number;
      name: string;
      type: ProviderType;
      logoUrl: string | null;
      rating: number;
      contactPhone: string | null;
      whatsappPhone: string | null;
      cities: string[] | null;
    }[]
  > {
    const { providers } = await this.findAvailableForRoute(fromCity, toCity);
    return providers.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      logoUrl: p.logoUrl,
      rating: Number(p.rating) || 0,
      contactPhone: p.contactPhone,
      whatsappPhone: p.whatsappPhone,
      cities: p.cities,
    }));
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

  async createAssignment(
    superAgent: User,
    dto: {
      trackingNumber?: string;
      orderId?: number;
      parcelId?: number;
      shipmentId?: number;
      providerId: number;
      availabilityId?: number;
      fromCity: string;
      toCity: string;
      parcelCount?: number;
      weightKg?: number;
      agreedPrice?: number;
      scheduledDeparture?: string;
      superAgentNotes?: string;
    },
  ): Promise<TransportAssignment> {
    const provider = await this.providerRepo.findOne({
      where: { id: dto.providerId },
    });
    if (!provider) throw new NotFoundException('Msafirishaji hajapatikana');
    if (provider.status !== ProviderStatus.VERIFIED) {
      throw new BadRequestException('Msafirishaji huyu hajakaguliwa bado');
    }

    // Auto-confirm large providers, manual for small
    const isAutoConfirm = provider.confirmMode === ConfirmMode.AUTO;

    // Reserve slot if availability specified
    if (dto.availabilityId) {
      await this.reserveCapacity(dto.availabilityId, dto.weightKg || 1);
    }

    const assignment = await this.assignmentRepo.save(
      this.assignmentRepo.create({
        trackingNumber: dto.trackingNumber || null,
        orderId: dto.orderId || null,
        parcelId: dto.parcelId || null,
        shipmentId: dto.shipmentId || null,
        assignedById: superAgent.id,
        providerId: dto.providerId,
        availabilityId: dto.availabilityId || null,
        fromCity: dto.fromCity,
        toCity: dto.toCity,
        parcelCount: dto.parcelCount || 1,
        weightKg: dto.weightKg || 0,
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
    return this.assignmentRepo.save(assignment);
  }

  // Update assignment status (collected/departed/arrived/completed) with proof
  async updateAssignmentStatus(
    userId: number,
    assignmentId: number,
    dto: {
      status: AssignmentStatus;
      proofUrl?: string;
      notes?: string;
    },
  ) {
    const provider = await this.getMyProfile(userId);
    const a = await this.assignmentRepo.findOne({
      where: { id: assignmentId, providerId: provider.id },
    });
    if (!a) throw new NotFoundException('Mgawo haukupatikana');

    const now = new Date();
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
      case AssignmentStatus.COMPLETED:
        a.completedAt = now;
        await this.providerRepo.update(provider.id, {
          completedAssignments: () => 'completedAssignments + 1',
        });
        // Award reputation for completed transport assignment
        if (provider.userId) {
          this.reputationService
            .award(provider.userId, ReputationEventType.TRANSPORT_COMPLETED, {
              sourceEntityType: 'transport_assignment',
              sourceEntityId: a.id,
            })
            .catch(() => {});
        }
        break;
    }
    return this.assignmentRepo.save(a);
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

  // Get assignments for a tracking number
  async getAssignmentByTracking(
    trackingNumber: string,
  ): Promise<TransportAssignment[]> {
    return this.assignmentRepo.find({
      where: { trackingNumber },
      relations: { provider: true },
      order: { createdAt: 'DESC' },
    });
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
