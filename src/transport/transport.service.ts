/**
 * TransportService — Core transport module logic
 * Place at: src/transport/transport.service.ts
 */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ReputationService } from '../reputation/reputation.service';
import { ReputationEventType } from '../reputation/entities/reputation-event.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  capacityWeightKg,
  releaseSlotAtomic,
  reserveSlotAtomic,
} from './slot-capacity';
import {
  BookableRun,
  RunBookingContext,
  assertJourneyRunsOperating,
  assertRunBookable,
  findBookableRuns,
  holdRunsForJourney,
  journeyRunStopHubs,
  parseTravelDate,
} from './run-supply';
import { projectShipmentForParcel } from '../shipments/shipment-projection';
import { cityMatchParams, cityMatchSql, normalizeDiscoveryCity } from './city-match';
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
import { ParcelCustodyEvent } from '../super-agents/entities/parcel-custody-event.entity';
import { assertFirstMileComplete } from '../shipments/first-mile-guard';
import { SuperAgent, SuperAgentStatus } from '../super-agents/entities/super-agent.entity';
import { Shipment, ShipmentStatus } from '../shipments/entities/shipment.entity';
import { TransportRoutePriceHistory } from './entities/transport-route-price-history.entity';
import { RoleContextService } from '../role-context/role-context.service';
import { SearchIndexService } from '../search/search-index.service';
import type { RoleContext } from '../role-context/role-context.types';
import {
  AccountRoleStatus,
  AccountRoleType,
  RoleProfileType,
} from '../role-context/entities/account-role.entity';

// Stage 3S-B2: the only three comparison orders discovery supports. An
// unrecognised/absent value is never an error here — every caller treats it
// as "use the default", which findAvailableForRoute defines as 'earliest'.
export type DiscoverySortBy = 'cheapest' | 'fastest' | 'earliest';
export const DISCOVERY_SORT_VALUES: readonly DiscoverySortBy[] = ['cheapest', 'fastest', 'earliest'];

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
    private readonly roleContextService: RoleContextService,
    private readonly searchIndex: SearchIndexService,
    private readonly dataSource: DataSource,
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
  //
  // Multi-Business Authority Stage 1B: fails closed (returns null, same
  // as "doesn't have one") rather than arbitrarily picking one, if this
  // user ever had more than one active SuperAgent row. Unreachable today
  // -- SuperAgentsService.apply()'s own "already have a super agent
  // application" guard still blocks a second row from ever being created
  // -- but this must never silently trust that guard to hold forever.
  private async findCallerSuperAgent(userId: number): Promise<SuperAgent | null> {
    const matches = await this.superAgentRepo.find({ where: { user: { id: userId } }, order: { id: 'ASC' } });
    return matches.length === 1 ? matches[0] : null;
  }

  // 3S-B1: canonical Super-Agent authority for creating a transport
  // assignment — the caller's CURRENT active role must name the SPECIFIC
  // hub profile (id + owning user + a workspace consistent with the acting
  // context), never merely "this user happens to own a SuperAgent row
  // somewhere," matching the standard collectAssignedParcel() already holds
  // the provider side to. A Business that legitimately also owns a
  // TransportProvider profile is unaffected — this only ever reads the
  // SuperAgent table, scoped to the profile the caller is actively acting
  // as; switching into the Transport Provider role for the same Business
  // does not carry over authority here, and vice versa.
  private async resolveAssigningHub(caller: User, roleContext?: RoleContext): Promise<SuperAgent> {
    if (roleContext?.roleType === AccountRoleType.SUPER_AGENT) {
      if (roleContext.userId !== caller.id) {
        throw new ForbiddenException('Only a Super Agent can create a transport assignment');
      }
      const hub = await this.superAgentRepo.findOne({
        where: { id: roleContext.profileId, userId: caller.id, status: SuperAgentStatus.ACTIVE },
      });
      if (!hub || (hub.workspaceId != null && hub.workspaceId !== roleContext.workspaceId)) {
        throw new ForbiddenException('An active Super Agent hub is required to create a transport assignment');
      }
      return hub;
    }
    // Administrative fallback — unchanged from the prior behaviour: an
    // admin/manager may act without switching into the SUPER_AGENT role,
    // but only when they themselves unambiguously own exactly one
    // SuperAgent row (the same fail-closed-on-ambiguity lookup this method
    // always used; not re-scoped here to keep this slice minimal).
    if (roleContext?.roleType === AccountRoleType.ADMIN || roleContext?.roleType === AccountRoleType.MANAGER) {
      const hub = await this.findCallerSuperAgent(caller.id);
      if (hub) return hub;
    }
    throw new ForbiddenException('Only a Super Agent can create a transport assignment');
  }

  // Multi-Business Authority Stage 1B. Same fail-closed-on-ambiguity
  // posture as findCallerSuperAgent above, for the caller's own
  // TransportProvider row. Unreachable today -- register()'s own "Una
  // akaunti ya usafirishaji tayari" guard still blocks a second row.
  private async resolveActingTransportProvider(userId: number, relations?: Record<string, boolean>): Promise<TransportProvider | null> {
    const matches = await this.providerRepo.find({ where: { userId }, order: { id: 'ASC' }, relations });
    return matches.length === 1 ? matches[0] : null;
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
    const existing = await this.resolveActingTransportProvider(user.id);
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
    const p = await this.resolveActingTransportProvider(userId, { user: true });
    if (!p) throw new NotFoundException('Transport account not found');
    return p;
  }

  // Single source of truth for "is this provider id real and eligible to be
  // selected for a shipment/assignment right now" — mirrors the exact check
  // createAssignment() already applies, so any caller (Shipment confirmation
  // included) gets the same provider policy without redefining it locally.
  async assertEligibleProvider(
    providerId: number,
    em?: EntityManager,
  ): Promise<TransportProvider> {
    const repo = em ? em.getRepository(TransportProvider) : this.providerRepo;
    const provider = await repo.findOne({ where: { id: providerId } });
    if (!provider) throw new NotFoundException('Msafirishaji hajapatikana');
    if (![ProviderStatus.VERIFIED, ProviderStatus.ACTIVE].includes(provider.status)) {
      throw new BadRequestException('Msafirishaji huyu hajahakikiwa au hafanyi kazi kwa sasa');
    }
    return provider;
  }

  // Stage 3S-B3 correction: server-authoritative proof that an already-
  // SELECTED route actually serves a requested journey, using the EXACT
  // same directional city-matching predicate findAvailableForRoute's
  // publishedQuery uses for a real bookable leg (r.originCity for "from",
  // r.destinationCity for "to", with the same coverageWards/loopStops/
  // coverageCity fallbacks that already carry LOCAL_LOOP/transit/last-mile
  // semantics) — reused here against ONE route row instead of duplicated
  // into a second matcher. Without this, a quote's or Shipment's own
  // client-supplied city labels could silently redefine which route/
  // journey a frozen price actually applies to.
  async assertRouteServesJourney(
    routeId: number,
    fromCity: string,
    toCity: string,
  ): Promise<void> {
    const from = normalizeDiscoveryCity(fromCity);
    const to = normalizeDiscoveryCity(toCity);
    if (from === null || to === null) {
      throw new BadRequestException('Both cities are required to validate the selected route');
    }
    const cityMatch = cityMatchSql;
    const match = await this.routeRepo
      .createQueryBuilder('r')
      .where('r.id = :routeId', { routeId })
      .andWhere(
        `(${cityMatch('r.originCity', 'from')} OR ${cityMatch('r.coverageWards', 'from')} OR ${cityMatch('r.loopStops', 'from')} OR ${cityMatch('r.coverageCity', 'from')})`,
        cityMatchParams('from', from),
      )
      .andWhere(
        `(${cityMatch('r.destinationCity', 'to')} OR ${cityMatch('r.coverageWards', 'to')} OR ${cityMatch('r.loopStops', 'to')} OR ${cityMatch('r.coverageCity', 'to')})`,
        cityMatchParams('to', to),
      )
      .getOne();
    if (!match) {
      throw new BadRequestException(
        'The selected route does not serve the requested origin/destination',
      );
    }
  }

  // Stage 3S-B3 correction: proves a specific availability slot is CURRENTLY
  // eligible/discoverable — reusing the identical conditions
  // findAvailableForRoute's publishedQuery already applies (open status,
  // verified/active provider, today/tomorrow window, slot + weight
  // capacity) via a query scoped to this one row, rather than a second,
  // possibly-divergent eligibility policy. A caller cannot use the direct
  // quote API to obtain an OFFERED quote against a FULL/CANCELLED/stale/
  // unverified-provider slot that discovery itself would never have shown.
  async assertAvailabilityIsDiscoverable(
    availabilityId: number,
    weightKg: number,
  ): Promise<ProviderAvailability> {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const qb = this.availabilityRepo
      .createQueryBuilder('a')
      .leftJoin('a.provider', 'p')
      .where('a.id = :id', { id: availabilityId })
      .andWhere('a.status = :open', { open: AvailabilityStatus.OPEN })
      .andWhere('p.status IN (:...publishedProviderStatuses)', {
        publishedProviderStatuses: [ProviderStatus.VERIFIED, ProviderStatus.ACTIVE],
      })
      .andWhere('a.date IN (:...dates)', { dates: [today, tomorrow] })
      .andWhere('a.usedSlots < a.totalSlots');
    if (weightKg > 0) {
      qb.andWhere('(a.totalCapacityKg - a.usedCapacityKg) >= :weightKg', { weightKg });
    }
    const availability = await qb.getOne();
    if (!availability) {
      throw new BadRequestException(
        'That availability slot is no longer eligible for a new quote',
      );
    }
    return availability;
  }

  // Stage 3S-B4: the ONE deterministic resolver for "what does this route
  // actually cost right now" -- discovery's cheapest sort, quote creation,
  // and Shipment's own inline pricing all resolve through this rather than
  // reading TransportRoute.pricePerKg/fixedFee directly, so a scheduled
  // future price change can never leak early and an already-frozen
  // TransportQuote/Shipment (which never call this again after creation)
  // can never be affected by a later edit. Falls back to the route's own
  // plain columns only for a route that predates this table and has never
  // been price-edited since (no history row exists yet for it at all) --
  // existence of the route itself is therefore always validated, whether by
  // that fallback or implicitly (a real history row's FK guarantees its
  // route exists).
  async getEffectiveRoutePrice(
    routeId: number,
    at: Date = new Date(),
  ): Promise<{ pricePerKg: number; fixedFee: number }> {
    // Uses the routeRepo's own manager (matching this file's established
    // "repo.manager as the default connection" convention, e.g. reserveSlot's
    // `em ?? this.availabilityRepo.manager`) rather than this.dataSource
    // directly -- a plain read needs no transaction.
    const rows = await this.routeRepo.manager.query(
      `SELECT "pricePerKg", "fixedFee" FROM public.transport_route_price_history
       WHERE "routeId" = $1 AND "effectiveFrom" <= $2 AND ("effectiveTo" IS NULL OR "effectiveTo" > $2)
       ORDER BY "effectiveFrom" DESC LIMIT 1`,
      [routeId, at],
    );
    if (rows.length) {
      return { pricePerKg: Number(rows[0].pricePerKg), fixedFee: Number(rows[0].fixedFee) };
    }
    const route = await this.routeRepo.findOne({ where: { id: routeId } });
    if (!route) throw new NotFoundException('Route not found');
    return { pricePerKg: Number(route.pricePerKg), fixedFee: Number(route.fixedFee) };
  }

  // Stage 3S-B4 (post-review correction): the ONLY write path for a route's
  // price. Called from updateRoute() (the existing, sole route-management
  // endpoint/authority -- ownership is already enforced there via
  // getMyProfile()+providerId, not duplicated here); never overwrites a
  // prior price in place.
  //
  // The version model supports one currently-effective version, zero or more
  // future-scheduled versions, and an immediate correction that does not
  // disturb an already-scheduled future version: the new version SPLITS
  // whichever existing window currently covers the requested `effectiveFrom`
  // instant, inheriting that window's own `effectiveTo` (so anything
  // scheduled beyond it is untouched), and truncates that window to end
  // exactly where the new one begins. Calling this again with the SAME
  // `effectiveFrom` as an existing not-yet-superseded version (most commonly
  // re-editing a future schedule before it takes effect) updates that
  // version's price IN PLACE instead of splitting -- an explicit reschedule,
  // not a new window. `effectiveFrom` must never be in the past (no
  // rewriting history); the two genuinely mutating cases are therefore
  // "now" (an immediate correction) and "a future instant" (a schedule).
  //
  // The DB-level range-EXCLUDE constraint (route-price-history-schema.ts) is
  // the actual, concurrency-proof backstop against overlap; the
  // pessimistic_write lock on the route row below serializes concurrent
  // callers for the SAME route so the in-memory "find the covering version"
  // step is never racing another write to that same route, but the
  // constraint is what fails a write closed even if that serialization were
  // ever bypassed (a second writer, a bug) -- see
  // transport-route-price-history.real-postgres.spec.ts's concurrency proof.
  async setRoutePrice(
    userId: number,
    routeId: number,
    dto: { pricePerKg?: number; fixedFee?: number; effectiveFrom?: string | Date },
  ): Promise<TransportRoute> {
    const p = await this.getMyProfile(userId);
    return this.dataSource.transaction(async (manager) => {
      const routeRepo = manager.getRepository(TransportRoute);
      const historyRepo = manager.getRepository(TransportRoutePriceHistory);

      const route = await routeRepo.findOne({
        where: { id: routeId, providerId: p.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!route) throw new NotFoundException('Njia haijapatikana');

      const nextPricePerKg = dto.pricePerKg != null ? Number(dto.pricePerKg) : Number(route.pricePerKg);
      const nextFixedFee = dto.fixedFee != null ? Number(dto.fixedFee) : Number(route.fixedFee);
      if (
        !Number.isFinite(nextPricePerKg) || nextPricePerKg < 0 ||
        !Number.isFinite(nextFixedFee) || nextFixedFee < 0
      ) {
        throw new BadRequestException('pricePerKg and fixedFee must be non-negative numbers');
      }
      const now = new Date();
      const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : now;
      if (Number.isNaN(effectiveFrom.getTime())) {
        throw new BadRequestException('Invalid effectiveFrom');
      }
      if (effectiveFrom.getTime() < now.getTime()) {
        throw new BadRequestException('effectiveFrom cannot be in the past');
      }

      // Backfill: this route predates Stage 3S-B4 versioning (no history row
      // exists for it yet) -- seed its first version at the route's own
      // createdAt, open-ended, using its current (pre-B4) plain columns, so
      // history becomes gapless from this point on without a separate data
      // migration.
      let versions = await historyRepo.find({
        where: { routeId: route.id },
        order: { effectiveFrom: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      if (versions.length === 0) {
        // Guards against a real (if narrow) clock-precision edge case: the
        // route was just read back with a DB-generated createdAt, and
        // `effectiveFrom` defaults to a separately-captured JS `new Date()`
        // a moment later in the SAME request -- normally later, but two
        // independent clocks (even on the same host) are never guaranteed
        // strictly monotonic against each other down to the millisecond.
        // Seeding at whichever instant is earlier guarantees this seed's own
        // window always covers the effectiveFrom this exact call is about to
        // use, without ever manufacturing a version that starts in the future.
        const seedEffectiveFrom = route.createdAt.getTime() <= effectiveFrom.getTime()
          ? route.createdAt
          : effectiveFrom;
        const seed = await historyRepo.save(historyRepo.create({
          routeId: route.id,
          pricePerKg: route.pricePerKg,
          fixedFee: route.fixedFee,
          effectiveFrom: seedEffectiveFrom,
          effectiveTo: null,
          changedByUserId: null,
        }));
        versions = [seed];
      }

      const covering = versions.find(
        (v) =>
          v.effectiveFrom.getTime() <= effectiveFrom.getTime() &&
          (v.effectiveTo === null || new Date(v.effectiveTo).getTime() > effectiveFrom.getTime()),
      );
      if (!covering) {
        // effectiveFrom >= now is enforced above, and the earliest version
        // always starts at route.createdAt <= now, so every valid
        // effectiveFrom falls inside exactly one existing window -- this
        // should be structurally unreachable, but fail closed rather than
        // silently doing something undefined if it ever is.
        throw new ConflictException('No price version covers the requested effective time');
      }

      if (covering.effectiveFrom.getTime() === effectiveFrom.getTime()) {
        // Reschedule in place: same version identity (its own start time is
        // unchanged), only its price changes. No other row's window is
        // touched, so this can never create an overlap or a gap.
        covering.pricePerKg = nextPricePerKg;
        covering.fixedFee = nextFixedFee;
        await historyRepo.save(covering);
      } else {
        // Genuine split: the new version starts partway through `covering`'s
        // window and inherits whatever `covering` used to end at --
        // preserving any later scheduled version beyond it untouched.
        const inheritedEffectiveTo = covering.effectiveTo;
        covering.effectiveTo = effectiveFrom;
        await historyRepo.save(covering);
        await historyRepo.save(historyRepo.create({
          routeId: route.id,
          pricePerKg: nextPricePerKg,
          fixedFee: nextFixedFee,
          effectiveFrom,
          effectiveTo: inheritedEffectiveTo,
          changedByUserId: userId,
        }));
      }

      // Keep the route's own denormalized columns in sync exactly when this
      // write actually changes what's effective RIGHT NOW -- true whenever
      // effectiveFrom <= now (an immediate correction, or a reschedule of
      // the version that already covers now); false for a genuine future
      // schedule, which must not leak into these columns early.
      if (effectiveFrom.getTime() <= now.getTime()) {
        route.pricePerKg = nextPricePerKg;
        route.fixedFee = nextFixedFee;
        await routeRepo.save(route);
      }
      return route;
    });
  }

  // Stage 3S-B4 (post-review correction): cancels a genuinely future,
  // not-yet-effective scheduled price version, merging its window back into
  // the version immediately preceding it (which now simply extends to cover
  // what the cancelled version used to). Refuses to touch a version that has
  // already become (or already was) effective -- only a still-future
  // schedule can be retracted this way; an already-active version can only
  // be superseded going forward via setRoutePrice, never deleted, since it
  // is real audit history the moment any part of its window has passed.
  async cancelScheduledRoutePrice(
    userId: number,
    routeId: number,
    effectiveFrom: string | Date,
  ): Promise<TransportRoute> {
    const p = await this.getMyProfile(userId);
    const target = new Date(effectiveFrom);
    if (Number.isNaN(target.getTime())) {
      throw new BadRequestException('Invalid effectiveFrom');
    }
    return this.dataSource.transaction(async (manager) => {
      const routeRepo = manager.getRepository(TransportRoute);
      const historyRepo = manager.getRepository(TransportRoutePriceHistory);

      const route = await routeRepo.findOne({
        where: { id: routeId, providerId: p.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!route) throw new NotFoundException('Njia haijapatikana');

      const version = await historyRepo.findOne({
        where: { routeId: route.id, effectiveFrom: target },
        lock: { mode: 'pessimistic_write' },
      });
      if (!version) throw new NotFoundException('Scheduled price version not found');
      if (version.effectiveFrom.getTime() <= Date.now()) {
        throw new ConflictException('Only a future, not-yet-effective price version can be cancelled');
      }

      const predecessor = await historyRepo.findOne({
        where: { routeId: route.id, effectiveTo: version.effectiveFrom },
        lock: { mode: 'pessimistic_write' },
      });
      if (!predecessor) {
        throw new ConflictException('No predecessor version found to merge the cancelled schedule into');
      }
      // Delete the cancelled version BEFORE extending its predecessor to
      // cover the gap -- doing it in the other order would momentarily leave
      // both rows overlapping (the extended predecessor's new window would
      // fully contain the still-present version's own window), which the
      // range-EXCLUDE constraint correctly refuses even mid-transaction.
      await historyRepo.remove(version);
      predecessor.effectiveTo = version.effectiveTo;
      await historyRepo.save(predecessor);

      if (predecessor.effectiveFrom.getTime() <= Date.now()) {
        route.pricePerKg = predecessor.pricePerKg;
        route.fixedFee = predecessor.fixedFee;
        await routeRepo.save(route);
      }
      return route;
    });
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

    // Stage 3S public identity: a Transport Provider profile should reflect
    // the physical execution model (Routes -> immutable Run stop snapshots),
    // not only the older sellable ProviderAvailability slots. Keep the
    // availability list below as a compatibility/booking surface while
    // exposing real upcoming Runs as the operational source of truth.
    const now = new Date();
    const upcomingRuns = isVerified
      ? await this.dataSource.query(
          `SELECT tr.id, tr."routeId", tr."vehicleId", tr."scheduledDeparture", tr.status,
                  COALESCE(
                    json_agg(
                      json_build_object(
                        'sequence', trs.sequence,
                        'locationLabel', trs."locationLabel",
                        'loadingAllowed', trs."loadingAllowed",
                        'unloadingAllowed', trs."unloadingAllowed",
                        'customerCollectionAllowed', trs."customerCollectionAllowed"
                      ) ORDER BY trs.sequence
                    ) FILTER (WHERE trs.id IS NOT NULL),
                    '[]'::json
                  ) AS stops
             FROM public.transport_run tr
             LEFT JOIN public.transport_run_stop trs ON trs."runId" = tr.id
            WHERE tr."providerId" = $1
              AND tr.status IN ('scheduled','open','closed')
              AND tr."scheduledDeparture" >= $2
            GROUP BY tr.id
            ORDER BY tr."scheduledDeparture" ASC
            LIMIT 20`,
          [p.id, now],
        )
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
      totalRatings: p.totalRatings,
      completedAssignments: p.completedAssignments,
      // Safe verification signal: visitors learn that Kentexa approved the
      // provider without exposing registration numbers, licence files,
      // admin notes or any other sensitive verification material.
      verification: {
        providerVerified: isVerified,
        verifiedAt: isVerified ? p.verifiedAt : null,
      },
      // Coverage is derived from canonical active routes/stops. The legacy
      // free-text provider.cities field remains in the response above only
      // for backwards compatibility and is not the public authority.
      coverage: Array.from(new Set(routes.flatMap((r: any) => [
        r.originCity, r.destinationCity, r.coverageCity,
        ...(r.transitCities || []), ...(r.loopStops || []), ...(r.coverageWards || []),
      ]).filter(Boolean))),
      upcomingRuns: upcomingRuns.map((r: any) => ({
        id: Number(r.id),
        routeId: Number(r.routeId),
        vehicleId: r.vehicleId == null ? null : Number(r.vehicleId),
        scheduledDeparture: r.scheduledDeparture,
        status: r.status,
        stops: Array.isArray(r.stops) ? r.stops : [],
      })),
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

    this.indexRoute(route).catch(() => {});
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
    // Stage 3S-B4: pricePerKg/fixedFee no longer go through this generic
    // whitelist-assign -- they route through setRoutePrice(), the canonical
    // price-history authority, so a price edit is versioned/auditable
    // instead of silently overwriting what the price used to be. Every
    // other field on this same endpoint keeps its existing simple path.
    const editable = [
      'routeType',
      'originCity',
      'destinationCity',
      'transitCities',
      'loopStops',
      'coverageWards',
      'coverageCity',
      'estimatedHours',
      'isActive',
      'notes',
    ];
    for (const key of editable) {
      if (dto[key] !== undefined) (route as any)[key] = dto[key];
    }
    const saved = await this.routeRepo.save(route);
    if (saved.isActive) this.indexRoute(saved).catch(() => {});
    else this.searchIndex.remove('transport_route', saved.id).catch(() => {});

    if (dto.pricePerKg !== undefined || dto.fixedFee !== undefined) {
      return this.setRoutePrice(userId, routeId, {
        pricePerKg: dto.pricePerKg,
        fixedFee: dto.fixedFee,
        effectiveFrom: dto.priceEffectiveFrom,
      });
    }
    return saved;
  }

  private async indexRoute(route: TransportRoute): Promise<void> {
    const text = [route.routeType, route.originCity, route.destinationCity, ...(route.transitCities || []), ...(route.loopStops || []), ...(route.coverageWards || []), route.coverageCity, route.notes].filter(Boolean).join(' \n ');
    await this.searchIndex.upsert('transport_route', route.id, text);
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
    opts: { allowUnconstrainedSide?: boolean; sortBy?: DiscoverySortBy; providersOnly?: boolean } = {},
  ): Promise<{
    published: ProviderAvailability[];
    providers: TransportProvider[];
  }> {
    // Stage 2E hardening (shared PUBLIC path): trimmed 2..80 characters, LIKE
    // wildcards literal (see city-match.ts). null = an explicitly
    // unconstrained side, only ever allowed for GET /transport/available.
    const from = normalizeDiscoveryCity(fromCity, opts.allowUnconstrainedSide);
    const to = normalizeDiscoveryCity(toCity, opts.allowUnconstrainedSide);
    if (from === null && to === null) {
      throw new BadRequestException('At least one of the two cities is required');
    }
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
    const cityMatch = cityMatchSql;

    const publishedQuery = this.availabilityRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.provider', 'p')
      .leftJoinAndSelect('a.route', 'r')
      .where('a.status = :open', { open: AvailabilityStatus.OPEN })
      // A suspended/unverified provider's slots must not be published (or
      // therefore bookable): the provider is joined above but was never
      // constrained by status here, unlike the providers query below.
      .andWhere('p.status IN (:...publishedProviderStatuses)', {
        publishedProviderStatuses: [ProviderStatus.VERIFIED, ProviderStatus.ACTIVE],
      })
      .andWhere('a.date IN (:...dates)', { dates: [today, tomorrow] })
      .andWhere('a.usedSlots < a.totalSlots');
    if (from !== null) {
      publishedQuery.andWhere(
        // Origin/destination-city columns only cover intercity routes — a
        // last-mile route's coverage lives in coverageWards/coverageCity
        // instead, and a local-loop van's in loopStops. Without matching
        // those too, a same-city search like "Kariakoo to Bunju" (both
        // wards inside Dar es Salaam) never found the boda/van providers
        // who actually cover exactly that — only real intercity routes
        // ever matched at all.
        `(${cityMatch('a.fromCity', 'from')} OR ${cityMatch('r.originCity', 'from')} OR ${cityMatch('r.coverageWards', 'from')} OR ${cityMatch('r.loopStops', 'from')} OR ${cityMatch('r.coverageCity', 'from')})`,
        cityMatchParams('from', from),
      );
    }
    if (to !== null) {
      publishedQuery.andWhere(
        `(${cityMatch('a.toCity', 'to')} OR ${cityMatch('r.destinationCity', 'to')} OR ${cityMatch('r.coverageWards', 'to')} OR ${cityMatch('r.loopStops', 'to')} OR ${cityMatch('r.coverageCity', 'to')})`,
        cityMatchParams('to', to),
      );
    }
    if (weightKg > 0) {
      publishedQuery.andWhere(
        '(a.totalCapacityKg - a.usedCapacityKg) >= :weightKg',
        { weightKg },
      );
    }
    // Stage 3S-B2: comparison sort — read-side only, no capacity/Shipment/
    // custody write anywhere in this method. Unspecified/unrecognised sortBy
    // preserves the EXACT prior default (earliest departure), so every
    // existing caller (Shipment discovery, the coverage map, the specs
    // above) keeps its current behaviour unchanged. A trip with no linked
    // TransportRoute has no price/duration to compare by (a route-less
    // manually-published slot only ever carried fromCity/toCity/date/time)
    // — such trips sort to the END of a price/duration ordering (NULLS
    // LAST) rather than falsely tying at zero, and still appear normally
    // under 'earliest'. `a.id` is the final, deterministic tiebreaker for
    // every mode: it is the one value guaranteed stable and unique across
    // repeated identical searches.
    // Stage 3S-B4: sorts by the route's CURRENTLY EFFECTIVE price (a
    // correlated subquery into transport_route_price_history, resolved at
    // query time), not the possibly-stale denormalized route columns -- a
    // scheduled future price change must not affect today's ordering, and an
    // already-active edit must be reflected immediately. Falls back to the
    // plain route columns only for a route with no history row at all yet
    // (never price-edited since Stage 3S-B4 shipped).
    const effectivePriceSubquery = (column: 'pricePerKg' | 'fixedFee') =>
      `(SELECT h."${column}" FROM public.transport_route_price_history h
        WHERE h."routeId" = r.id AND h."effectiveFrom" <= now()
          AND (h."effectiveTo" IS NULL OR h."effectiveTo" > now())
        ORDER BY h."effectiveFrom" DESC LIMIT 1)`;
    const cheapestExpr = `CASE WHEN r.id IS NULL THEN NULL ELSE GREATEST(
      COALESCE(${effectivePriceSubquery('pricePerKg')}, r."pricePerKg", 0) * :cmpWeight,
      COALESCE(${effectivePriceSubquery('fixedFee')}, r."fixedFee", 0)
    ) END`;
    switch (opts.sortBy) {
      case 'cheapest':
        publishedQuery
          .addSelect(cheapestExpr, 'cheapest_price')
          .setParameter('cmpWeight', weightKg > 0 ? weightKg : 0)
          .orderBy('cheapest_price', 'ASC', 'NULLS LAST');
        break;
      case 'fastest':
        publishedQuery.orderBy('r.estimatedHours', 'ASC', 'NULLS LAST');
        break;
      case 'earliest':
      default:
        publishedQuery.orderBy('a.date', 'ASC').addOrderBy('a.departureTime', 'ASC');
        break;
    }
    // Gate 2: senders are no longer offered provider_availability slots (see
    // discoverSupply). providersOnly skips that table altogether; the slot
    // query remains only for the legacy Super Agent dispatch screen.
    const published = opts.providersOnly
      ? []
      : await publishedQuery.addOrderBy('a.id', 'ASC').getMany();

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
      });
    if (from !== null) {
      providersQuery.andWhere(
        `(
          (r."routeType" = 'intercity' AND ${cityMatch('r.originCity', 'from')})
          OR (r."routeType" = 'local_loop' AND (${cityMatch('r.loopStops', 'from')} OR ${cityMatch('r.coverageCity', 'from')}))
          OR (r."routeType" = 'last_mile' AND (${cityMatch('r.coverageWards', 'from')} OR ${cityMatch('r.coverageCity', 'from')}))
        )`,
        cityMatchParams('from', from),
      );
    }
    if (to !== null) {
      providersQuery.andWhere(
        `(
          (r."routeType" = 'intercity' AND ${cityMatch('r.destinationCity', 'to')})
          OR (r."routeType" = 'local_loop' AND (${cityMatch('r.loopStops', 'to')} OR ${cityMatch('r.coverageCity', 'to')}))
          OR (r."routeType" = 'last_mile' AND (${cityMatch('r.coverageWards', 'to')} OR ${cityMatch('r.coverageCity', 'to')}))
        )`,
        cityMatchParams('to', to),
      );
    }
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

  // ── Gate 2: ONE transport supply model ───────────────────────────────────
  // What a sender can book is an open, future TransportRun -- the same object
  // the transporter schedules, loads and drives (see run-supply.ts). These
  // are the only doors Shipment discovery, the Journey composer, quoting and
  // booking use; none of them reads provider_availability.

  /** Bookable Runs for one origin/destination pair, plus the verified providers covering it. */
  async discoverSupply(
    fromCity: string,
    toCity: string,
    weightKg = 0,
    opts: { sortBy?: DiscoverySortBy; providerId?: number; onDate?: string } = {},
  ): Promise<{ trips: BookableRun[]; providers: TransportProvider[] }> {
    const from = normalizeDiscoveryCity(fromCity) as string;
    const to = normalizeDiscoveryCity(toCity) as string;
    const onDate = opts.onDate ? parseTravelDate(opts.onDate) : undefined;
    const [{ providers }, trips] = await Promise.all([
      this.findAvailableForRoute(from, to, weightKg, { providersOnly: true }),
      findBookableRuns(this.dataSource.manager, { from, to, weightKg, providerId: opts.providerId, onDate }),
    ]);
    const price = (t: BookableRun) => Math.max(t.pricePerKg * (weightKg > 0 ? weightKg : 0), t.fixedFee);
    if (opts.sortBy === 'cheapest') {
      trips.sort((a, b) => price(a) - price(b) || a.departureAt.getTime() - b.departureAt.getTime() || a.runId - b.runId);
    } else if (opts.sortBy === 'fastest') {
      const hours = (t: BookableRun) => t.estimatedHours ?? Number.POSITIVE_INFINITY;
      trips.sort((a, b) => hours(a) - hours(b) || a.departureAt.getTime() - b.departureAt.getTime() || a.runId - b.runId);
    }
    return { trips, providers };
  }

  /**
   * The one Run `runId`, if it is bookable AND serves from -> to: returns it
   * with the stop pair the parcel would load and unload at, or null.
   */
  async findBookableRun(runId: number, fromCity: string, toCity: string, weightKg = 0): Promise<BookableRun | null> {
    const from = normalizeDiscoveryCity(fromCity) as string;
    const to = normalizeDiscoveryCity(toCity) as string;
    const [trip] = await findBookableRuns(this.dataSource.manager, { from, to, weightKg, runId, limit: 1 });
    return trip ?? null;
  }

  /** Throws unless `runId` is bookable, belongs to ctx's provider/route and serves from -> to. */
  async assertRunServes(
    runId: number,
    fromCity: string,
    toCity: string,
    weightKg: number,
    ctx: RunBookingContext = {},
  ): Promise<BookableRun> {
    // First the reasons that have nothing to do with geography (gone, closed,
    // departed, full, wrong provider) -- each with its own message.
    await assertRunBookable(this.dataSource.manager, runId, weightKg, ctx);
    const trip = await this.findBookableRun(runId, fromCity, toCity, weightKg);
    if (!trip) {
      throw new BadRequestException('The selected trip does not serve the requested origin/destination');
    }
    return trip;
  }

  /** See run-supply.ts assertRunBookable. */
  async assertRunBookable(runId: number, weightKg: number, ctx: RunBookingContext = {}, em?: EntityManager): Promise<void> {
    await assertRunBookable(em ?? this.dataSource.manager, runId, weightKg, ctx);
  }

  /**
   * Called inside the transaction that inserts a Shipment for a committed
   * Journey: locks and re-proves every Run the Journey names. The inserted
   * Shipment is the reservation -- there is no counter to keep in step.
   */
  async holdRunCapacityForJourney(journeySelectionId: number, weightKg: number, em: EntityManager): Promise<number[]> {
    return holdRunsForJourney(em, journeySelectionId, weightKg);
  }

  /** Gate 5: the hubs a Journey's Run stops are bound to (see run-supply.ts). */
  async journeyRunStopHubs(journeySelectionId: number, em?: EntityManager) {
    return journeyRunStopHubs(em ?? this.dataSource.manager, journeySelectionId);
  }

  /** A Shipment that already holds its place may be confirmed unless its Run was cancelled or is over. */
  async assertJourneyRunsOperating(journeySelectionId: number, em?: EntityManager): Promise<void> {
    await assertJourneyRunsOperating(em ?? this.dataSource.manager, journeySelectionId);
  }

  // ── PUBLIC: safe availability discovery ──────────────────────────────────
  // GET /transport/available is genuinely called by a public page
  // (RouteCoverageMap.js) pre-login, so it stays public rather than being
  // locked behind auth — but it must never again return the raw
  // TransportProvider entity (apiKey, contract fields, contactEmail, admin
  // notes) embedded in every result the way findAvailableForRoute's
  // internal shape does. Same underlying query, safe projection on top.
  // weightKg/sortBy are additive (Stage 3S-B2): both optional, both default
  // to the exact prior behaviour (unspecified weight, earliest-departure
  // order) — an existing caller passing neither sees no change at all.
  async findPublicAvailabilityForRoute(
    fromCity: string,
    toCity: string,
    weightKg = 0,
    sortBy?: DiscoverySortBy,
  ) {
    // The public coverage page sends `to=` (empty) meaning "from X, anywhere":
    // an absent/exactly-empty side is an explicit, literal "unconstrained"
    // here only -- never a wildcard pattern, and never whitespace-only text.
    const { published, providers } = await this.findAvailableForRoute(
      fromCity,
      toCity,
      weightKg,
      { allowUnconstrainedSide: true, sortBy },
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
        // Canonical journey duration (Stage 3S-B2) — the same TransportRoute
        // field 'fastest' sorts by; null when no route is linked (a
        // manually-published slot has no journey-time data to report).
        estimatedHours: (a as any).route?.estimatedHours ?? null,
      })),
      providers: providers.map((p) => this.toSafeProvider(p)),
    };
  }

  /**
   * Customer-facing service discovery. Unlike discoverSupply(), this answers
   * "who promises to serve this route?" rather than "which concrete vehicle
   * run is open right now?". A TransportRun is execution supply and is bound
   * later; normal Tuma Mzigo must not disappear merely because today's run
   * has not been generated/opened yet.
   */
  async discoverServiceRoutes(
    fromCity: string,
    toCity: string,
    weightKg = 0,
    providerId?: number,
  ): Promise<Array<{
    providerId: number;
    providerName: string;
    providerType: string;
    providerLogo: string | null;
    routeId: number;
    estimatedHours: number | null;
    pricePerKg: number;
    fixedFee: number;
  }>> {
    const from = normalizeDiscoveryCity(fromCity);
    const to = normalizeDiscoveryCity(toCity);
    if (from === null || to === null) {
      throw new BadRequestException('Both cities are required to discover transport services');
    }

    // Active TransportRoute is the canonical service-coverage authority.
    // Do NOT pre-filter through provider.cities: that legacy profile field can
    // be stale (for example a provider can add a Dar→Mbeya route without
    // updating its old city list) and must not hide a valid route.
    const routes = await this.routeRepo.find({
      where: { isActive: true },
      relations: ['provider'],
      order: { id: 'ASC' },
    });
    const services: Array<any> = [];

    for (const route of routes) {
      const provider = route.provider;
      if (!provider || provider.status !== TransportProviderStatus.VERIFIED) continue;
      if (providerId && provider.id !== Number(providerId)) continue;
      try {
          await this.assertRouteServesJourney(route.id, from, to);
      } catch {
        continue;
      }
      const price = await this.getEffectiveRoutePrice(route.id);
      services.push({
          providerId: provider.id,
          providerName: provider.name,
          providerType: provider.type,
          providerLogo: provider.logoUrl ?? null,
          routeId: route.id,
          estimatedHours: route.estimatedHours ?? null,
          pricePerKg: price.pricePerKg,
          fixedFee: price.fixedFee,
      });
    }
    return services;
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
  //
  // Legacy entry point, kept for createAssignment (which pre-validates its
  // own slot) with its previous condition -- "a free slot" -- and its
  // previous no-throw contract, but now a single atomic SQL UPDATE with
  // correct numeric kg arithmetic (see slot-capacity.ts). Shipments use the
  // validated, fail-closed reserveSlot() below instead.
  async reserveCapacity(
    availabilityId: number,
    weightKg: number,
    em?: EntityManager,
  ): Promise<void> {
    await reserveSlotAtomic(
      em ?? this.availabilityRepo.manager,
      availabilityId,
      capacityWeightKg(weightKg),
    );
  }

  // Shipment slot attachment (Stage 2C): validated + atomic + fail-closed.
  // Identity (provider/route), status and date are read from ONE slot row,
  // and the same identity/status/date/free-slot/kg conditions are then
  // re-asserted inside the conditional UPDATE itself, which is the final
  // authority -- there is no validate-then-update gap to race through. Pass
  // the transaction's EntityManager so the reservation commits or rolls back
  // with the caller's other writes. ctx.providerId / ctx.routeId are the
  // shipment's selected provider/route (when any); the slot must agree.
  async reserveSlot(
    availabilityId: number,
    weightKg: number,
    ctx: { providerId?: number | null; routeId?: number | null },
    em?: EntityManager,
  ): Promise<void> {
    const manager = em ?? this.availabilityRepo.manager;
    const weight = capacityWeightKg(weightKg);
    const slot = await this.loadSlotFor(manager, availabilityId, ctx);
    if (slot.status !== AvailabilityStatus.OPEN || this.isPastDate(slot.date)) {
      throw new BadRequestException('That slot is no longer available');
    }
    if (slot.usedSlots >= slot.totalSlots) {
      throw new ConflictException('That slot is full');
    }
    await this.assertEligibleProvider(slot.providerId, manager);
    // The UPDATE re-asserts the EXPECTED contract (the shipment's selected
    // provider/route), not values read back from the slot row -- deriving them
    // from the slot would let a mismatch validate itself. With no selected
    // provider the slot's own provider (whose eligibility was just checked) is
    // pinned; with no selected route no route requirement is invented.
    const reserved = await reserveSlotAtomic(manager, availabilityId, weight, {
      today: new Date().toISOString().slice(0, 10),
      providerId: ctx.providerId || slot.providerId,
      routeId: ctx.routeId || undefined,
    });
    if (!reserved) {
      throw new ConflictException('That slot is full or no longer available');
    }
  }

  // For a Shipment that ALREADY holds a slot (attached at create): confirms
  // the slot still agrees with the provider/route being confirmed and is
  // still bookable, without touching capacity. FULL is fine -- this
  // shipment may be the one filling it.
  async assertHeldSlotMatches(
    availabilityId: number,
    ctx: { providerId?: number | null; routeId?: number | null },
    em?: EntityManager,
  ): Promise<void> {
    const slot = await this.loadSlotFor(
      em ?? this.availabilityRepo.manager,
      availabilityId,
      ctx,
    );
    if (
      slot.status === AvailabilityStatus.DEPARTED ||
      slot.status === AvailabilityStatus.CANCELLED
    ) {
      throw new BadRequestException('That slot is no longer available');
    }
  }

  private async loadSlotFor(
    manager: EntityManager,
    availabilityId: number,
    ctx: { providerId?: number | null; routeId?: number | null },
  ): Promise<ProviderAvailability> {
    const slot = await manager
      .getRepository(ProviderAvailability)
      .findOne({ where: { id: availabilityId } });
    if (!slot) throw new NotFoundException('Availability slot not found');
    if (ctx.providerId && slot.providerId !== ctx.providerId) {
      throw new BadRequestException(
        "That availability slot doesn't belong to the selected provider",
      );
    }
    // Route contract: when the shipment selected a route, the slot must have
    // exactly that route. A route-less (NULL) slot does NOT satisfy it. When no
    // route was selected there is no route requirement.
    if (ctx.routeId && slot.routeId !== ctx.routeId) {
      throw new BadRequestException(
        "That availability slot isn't for the selected route",
      );
    }
    return slot;
  }

  private isPastDate(date: string): boolean {
    return String(date).slice(0, 10) < new Date().toISOString().slice(0, 10);
  }

  // Counterpart to reserveCapacity — an assignment cancelled/declined
  // before departure must give its slot back, or a provider's real
  // capacity silently shrinks every time a booking falls through.
  //
  // Atomic and underflow-safe; the only status change is FULL -> OPEN, so a
  // DEPARTED/CANCELLED slot is never reopened. Uses the same weight rule as
  // reserve. Pass the transaction's EntityManager to make it part of it.
  async releaseCapacity(
    availabilityId: number,
    weightKg: number,
    em?: EntityManager,
  ): Promise<void> {
    await releaseSlotAtomic(
      em ?? this.availabilityRepo.manager,
      availabilityId,
      capacityWeightKg(weightKg),
    );
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

  // A carrier's arrival report is progress on its assignment, not proof
  // that a destination hub physically received the parcel. Only a receiving
  // hub may set ARRIVED_AT_HUB and record custody. COMPLETED is also
  // ambiguous (hub or buyer handoff) and never auto-translated.
  private static readonly PARCEL_SYNC: Partial<
    Record<AssignmentStatus, ParcelStatus>
  > = {
    [AssignmentStatus.DEPARTED]: ParcelStatus.IN_TRANSIT,
  };

  // A Parcel already resolved one way or another shouldn't be dragged
  // backwards by a transport event arriving late/out of order.
  private static readonly PARCEL_SYNC_BLOCKED = new Set([
    ParcelStatus.ARRIVED_AT_HUB,
    ParcelStatus.AWAITING_BUYER,
    ParcelStatus.OUT_FOR_DELIVERY,
    ParcelStatus.DELIVERED,
    ParcelStatus.SELF_PICKUP,
    ParcelStatus.RETURNED,
    ParcelStatus.DISPUTED,
  ]);

  // Best-effort mirror onto the standalone Shipment a Parcel may have
  // originated from — so a shipment requester sees real progress without
  // needing to know their parcel is also, internally, a Parcel. Never
  // blocks the transport-status update itself if it fails.
  private async syncParcelFromAssignment(
    a: TransportAssignment,
    newStatus: AssignmentStatus,
  ): Promise<void> {
    const parcelId = a.parcelRefId || a.parcelId;
    const targetParcelStatus = TransportService.PARCEL_SYNC[newStatus];
    if (!parcelId || !targetParcelStatus) return;
    try {
      // A legacy or administratively advanced assignment must never make a
      // parcel appear in transit without the provider collection evidence.
      if (newStatus === AssignmentStatus.DEPARTED &&
          !(await this.dataSource.getRepository(ParcelCustodyEvent).findOne({
            where: { parcelId, assignmentId: a.id, eventKind: 'transport_provider_collected' },
          }))) return;
      const parcel = await this.parcelRepo.findOne({ where: { id: parcelId } });
      if (!parcel || TransportService.PARCEL_SYNC_BLOCKED.has(parcel.status) ||
          parcel.status === targetParcelStatus) return;

      // A destination hub may accept while an older transport update is
      // waiting. Never overwrite its committed receipt with stale progress.
      const updated = await this.parcelRepo.update(
        { id: parcel.id, status: parcel.status }, { status: targetParcelStatus });
      if (updated.affected === 0) return;
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

      // Gate 3: the Shipment follows from the Parcel and custody truth
      // through the ONE projector -- it is never set from an assignment.
      await projectShipmentForParcel(this.dataSource.manager, parcel.id);
    } catch {
      /* non-fatal — the transport status update itself already succeeded */
    }
  }

  // The provider's authenticated collection is the first carrier-side
  // possession evidence. Lock the parcel before its assignment, matching the
  // dispatch path's lock order, so either action sees the other's result.
  private async collectAssignedParcel(
    caller: User, assignmentId: number, dto: { proofUrl?: string; notes?: string },
    context: RoleContext,
  ): Promise<TransportAssignment> {
    const snapshot = await this.assignmentRepo.findOne({ where: { id: assignmentId } });
    if (!snapshot) throw new NotFoundException('Mgawo haukupatikana');
    if (!snapshot.parcelRefId || (snapshot.parcelId != null && snapshot.parcelId !== snapshot.parcelRefId)) {
      throw new ConflictException('Assignment has no verified parcel binding');
    }
    const parcelId = snapshot.parcelRefId;
    return this.dataSource.transaction(async manager => {
      await manager.query('SELECT id FROM public.parcel WHERE id=$1 FOR UPDATE', [parcelId]);
      await manager.query('SELECT id FROM public.transport_assignment WHERE id=$1 FOR UPDATE', [assignmentId]);
      const assignment = await manager.getRepository(TransportAssignment).findOne({ where: { id: assignmentId } });
      if (!assignment || assignment.parcelRefId !== snapshot.parcelRefId ||
          assignment.parcelId !== snapshot.parcelRefId || assignment.status !== AssignmentStatus.ACCEPTED) {
        throw new ConflictException('Assignment is no longer awaiting collection');
      }
      const provider = await manager.getRepository(TransportProvider).findOne({ where: { id: assignment.providerId } });
      if (!provider || provider.userId !== caller.id || context.profileId !== provider.id ||
          ![ProviderStatus.VERIFIED, ProviderStatus.ACTIVE].includes(provider.status) ||
          (provider.businessId != null && context.businessId !== provider.businessId)) {
        throw new ForbiddenException('Only the assigned active provider can confirm collection');
      }
      const parcel = await manager.getRepository(Parcel).findOne({
        where: { id: parcelId }, relations: { superAgent: true },
      });
      const hub = parcel?.superAgent;
      if (!parcel || !hub || hub.userId !== assignment.assignedById ||
          assignment.trackingNumber !== parcel.trackingNumber ||
          ![ParcelStatus.RECEIVED_AT_HUB, ParcelStatus.VERIFIED, ParcelStatus.READY_FOR_DISPATCH,
            ParcelStatus.DISPATCHED].includes(parcel.status)) {
        throw new ConflictException('Parcel is not available for origin hub collection');
      }
      const lastCustody = await manager.getRepository(ParcelCustodyEvent).findOne({
        where: { parcelId: parcel.id }, order: { recordedAt: 'DESC', id: 'DESC' },
      });
      if (!lastCustody || lastCustody.toCustodianType !== 'super_agent' ||
          lastCustody.toCustodianId !== hub.id) {
        throw new ConflictException('Origin hub custody must be confirmed before collection');
      }
      await assertFirstMileComplete(manager, parcel.id); // never board before physical origin-hub receipt
      const now = new Date();
      assignment.status = AssignmentStatus.COLLECTED;
      assignment.collectedAt = now;
      assignment.collectionProofUrl = dto.proofUrl || null;
      if (dto.notes) assignment.providerNotes = dto.notes;
      await manager.getRepository(ParcelCustodyEvent).insert({
        parcelId: parcel.id, eventKind: 'transport_provider_collected',
        operationKey: `transport-collected:${assignment.id}`,
        fromCustodianType: 'super_agent', fromCustodianId: hub.id,
        toCustodianType: 'transport_provider', toCustodianId: provider.id,
        actorSource: 'account_role', actorUserId: caller.id,
        actorAccountRoleId: context.accountRoleId, actorRoleType: context.roleType,
        actorWorkspaceId: context.workspaceId ?? null, actorProviderId: null,
        hubId: hub.id, assignmentId: assignment.id, evidenceRef: null,
      });
      if (parcel.status !== ParcelStatus.DISPATCHED) {
        await manager.getRepository(Parcel).update(parcel.id, { status: ParcelStatus.DISPATCHED });
      }
      await manager.getRepository(ParcelTracking).insert({
        parcel, status: ParcelStatus.DISPATCHED, city: parcel.originCity,
        note: `Collected by assigned transport provider #${provider.id}`,
        updatedBy: provider.name, handlerType: 'transport_provider',
      });
      return manager.getRepository(TransportAssignment).save(assignment);
    });
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
    roleContext?: RoleContext,
  ): Promise<TransportAssignment> {
    // 3S-B1: canonical RoleContext/capability authority — see
    // resolveAssigningHub()'s own doc comment. Only for a parcel their own
    // hub actually holds — never trust a bare "I am a super agent, trust my
    // ids" claim from the client.
    const superAgent = await this.resolveAssigningHub(caller, roleContext);

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

    // Canonical, shared provider-eligibility policy (3S-B1) — the exact
    // check the Shipment confirmation path already uses, no longer a
    // second, independently-maintained copy of the same rule.
    const provider = await this.assertEligibleProvider(dto.providerId);

    // If a specific slot was chosen, it must actually belong to the
    // selected provider — pairing an unrelated availabilityId with any
    // providerId used to silently deplete a stranger's capacity with no
    // relationship check at all. This is only an ADVISORY fast-fail for a
    // friendly error message: the real, final capacity decision is the
    // atomic conditional UPDATE inside the transaction below, which
    // re-checks OPEN status/a free slot/kg headroom itself and cannot be
    // raced past this earlier read (see slot-capacity.ts).
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
    }

    // Auto-confirm large providers, manual for small
    const isAutoConfirm = provider.confirmMode === ConfirmMode.AUTO;
    // 3S-B1: ONE weight figure, used for BOTH the capacity reservation and
    // the value recorded on the assignment — previously these were two
    // independently-defaulted numbers (the reservation used
    // `dto.weightKg || 1`, ignoring the parcel's own declared weight
    // entirely, while the stored record used `dto.weightKg || parcel.weightKg
    // || 0`), so a caller that omitted weightKg on a heavier parcel reserved
    // far less capacity than the parcel actually needed — a real KG
    // oversubscription channel with no concurrency required at all.
    const weight = capacityWeightKg(
      dto.weightKg != null ? dto.weightKg : parcel.weightKg,
    );

    // 3S-B1: capacity reservation and the TransportAssignment insert are now
    // ONE transaction — a failed reservation creates no assignment, and a
    // failed insert after a successful reservation rolls the reservation
    // back with it. The parcel is locked FIRST, the same order every other
    // parcel-authority write in this codebase already uses (see
    // collectAssignedParcel/dispatchParcel), which also serialises two
    // concurrent createAssignment calls for the SAME parcel against each
    // other and against the idempotent-reuse check below.
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT id FROM public.parcel WHERE id=$1 FOR UPDATE', [parcel.id]);

      // Idempotent reuse: a parcel already carrying a LIVE (non-terminal)
      // assignment to this SAME provider/slot is a retry of the same
      // request (client timeout, double submit), not a second, independent
      // demand for capacity — return the existing row rather than reserving
      // a second slot for one physical parcel. A live assignment to a
      // DIFFERENT provider/slot is a genuine conflict: a parcel cannot be
      // simultaneously promised to two carriers.
      const live = await manager.getRepository(TransportAssignment).findOne({
        where: { parcelRefId: parcel.id },
        order: { id: 'DESC' },
      });
      if (live && ![AssignmentStatus.DECLINED, AssignmentStatus.CANCELLED].includes(live.status)) {
        if (live.providerId === dto.providerId && live.availabilityId === (dto.availabilityId ?? null)) {
          return live;
        }
        throw new ConflictException('This parcel already has an active transport assignment');
      }

      if (dto.availabilityId) {
        const reserved = await reserveSlotAtomic(manager, dto.availabilityId, weight, {
          today: new Date().toISOString().slice(0, 10),
          providerId: dto.providerId,
        });
        if (!reserved) {
          throw new ConflictException('That slot is full or no longer available');
        }
      }

      // orderId/shipmentId are never taken from the client — always derived
      // from the parcel that was just validated above, so they can't be
      // spoofed independently of a legitimate parcelId.
      const assignment = await manager.getRepository(TransportAssignment).save(
        manager.getRepository(TransportAssignment).create({
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
          weightKg: weight,
          agreedPrice: dto.agreedPrice || null,
          scheduledDeparture: dto.scheduledDeparture || null,
          superAgentNotes: dto.superAgentNotes || null,
          status: isAutoConfirm
            ? AssignmentStatus.ACCEPTED
            : AssignmentStatus.PENDING,
          acceptedAt: isAutoConfirm ? new Date() : null,
        }),
      );

      // Update provider stats. 3S-B1: quoted — an unquoted raw expression here
      // folds to the lowercase "totalassignments" in real PostgreSQL, which
      // does not exist (the real column is the mixed-case "totalAssignments");
      // this was silently broken against a real database before this slice's
      // first real-PG exercise of this exact line, unrelated to the
      // transaction/idempotency changes around it. See the same fix on
      // completedAssignments in updateAssignmentStatus below.
      await manager.getRepository(TransportProvider).update(provider.id, {
        totalAssignments: () => '"totalAssignments" + 1',
      });

      return assignment;
    });
  }

  // Provider responds to assignment. 3S-B1: locked + idempotent — two
  // concurrent/retried responses for the same assignment (a double-tap, a
  // client timeout-retry) must release its slot at most once, never twice.
  async respondToAssignment(
    userId: number,
    assignmentId: number,
    accept: boolean,
    declineReason?: string,
  ) {
    const provider = await this.getMyProfile(userId);
    const targetStatus = accept ? AssignmentStatus.ACCEPTED : AssignmentStatus.DECLINED;

    return this.dataSource.transaction(async (manager) => {
      const assignments = manager.getRepository(TransportAssignment);
      const assignment = await assignments.findOne({
        where: { id: assignmentId, providerId: provider.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!assignment) throw new NotFoundException('Mgawo haukupatikana');
      if (assignment.status === targetStatus) {
        // Idempotent retry: this response already committed under an
        // earlier request — return the settled row, never release twice.
        return assignment;
      }
      if (assignment.status !== AssignmentStatus.PENDING) {
        throw new NotFoundException('Mgawo haukupatikana');
      }

      assignment.status = targetStatus;
      assignment.acceptedAt = accept ? new Date() : null;
      assignment.declineReason = declineReason || null;
      const saved = await assignments.save(assignment);

      if (!accept && assignment.availabilityId) {
        await releaseSlotAtomic(manager, assignment.availabilityId, capacityWeightKg(assignment.weightKg));
      }
      return saved;
    });
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
    roleContext?: RoleContext,
  ) {
    if (dto.status === AssignmentStatus.COLLECTED) {
      if (!roleContext || roleContext.roleType !== AccountRoleType.TRANSPORT_PROVIDER ||
          roleContext.userId !== caller.id) {
        throw new ForbiddenException('Only the assigned provider can confirm collection');
      }
      return this.collectAssignedParcel(caller, assignmentId, dto, roleContext);
    }
    const existing = await this.assignmentRepo.findOne({ where: { id: assignmentId } });
    if (!existing) throw new NotFoundException('Mgawo haukupatikana');

    const providerProfile = await this.resolveActingTransportProvider(caller.id);
    const isOwningProvider = !!providerProfile && providerProfile.id === existing.providerId;
    const isCreatingSuperAgent =
      existing.assignedById === caller.id && !!(await this.findCallerSuperAgent(caller.id));
    // Active-role authority, never the legacy caller.role field — an admin
    // operating as another role loses the state-machine-skip privilege below
    // until they switch back.
    const isAdmin =
      roleContext?.roleType === AccountRoleType.ADMIN ||
      roleContext?.roleType === AccountRoleType.MANAGER;
    if (!isOwningProvider && !isCreatingSuperAgent && !isAdmin) {
      throw new ForbiddenException('Not authorized to update this transport assignment');
    }

    // 3S-B1: locked + idempotent. The unlocked read above is only for the
    // fast auth/404 checks; the transition itself re-reads the row UNDER a
    // row lock, so two concurrent/retried calls for the SAME assignment
    // (double-tap, client timeout-retry, or a genuine race) serialise on it.
    // The loser re-reads the ALREADY-APPLIED result and either finds itself
    // already at the target status (a pure no-op — no second capacity
    // release, no second reputation award, no second parcel-sync side
    // effect) or a real conflict against the now-current status — never a
    // duplicate transition.
    const saved = await this.dataSource.transaction(async (manager) => {
      const assignments = manager.getRepository(TransportAssignment);
      const a = await assignments.findOne({ where: { id: assignmentId }, lock: { mode: 'pessimistic_write' } });
      if (!a) throw new NotFoundException('Mgawo haukupatikana');
      if (a.status === dto.status) return a;

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
            await releaseSlotAtomic(manager, a.availabilityId, capacityWeightKg(a.weightKg));
          }
          break;
        case AssignmentStatus.COMPLETED:
          a.completedAt = now;
          // 3S-B1: quoted — see the identical fix on totalAssignments above.
          await manager.getRepository(TransportProvider).update(a.providerId, {
            completedAssignments: () => '"completedAssignments" + 1',
          });
          break;
      }
      const row = await assignments.save(a);

      // Reputation award stays inside the lock so a retry can never award it
      // twice — this only ever runs on the winning transition (the idempotent
      // no-op above returns before reaching here on any later call).
      if (dto.status === AssignmentStatus.COMPLETED && providerProfile?.userId) {
        this.reputationService
          .award(providerProfile.userId, ReputationEventType.TRANSPORT_COMPLETED, {
            sourceEntityType: 'transport_assignment',
            sourceEntityId: row.id,
          })
          .catch(() => {});
      }

      return row;
    });

    // Kentexa (not the transport provider directly) turns a real transport
    // event into the Parcel's own lifecycle — see PARCEL_SYNC's comment for
    // exactly which transitions apply and why COMPLETED is excluded.
    // syncParcelFromAssignment is itself idempotent (it re-checks the
    // parcel's CURRENT status before writing), so re-running it for the
    // no-op retry branch above is harmless.
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
    // TransportAdmin.js's own "📋 Zote" (All) tab sends status=all to mean
    // "no filter" — passing that string straight through to a `where`
    // clause on an enum column made Postgres reject it outright (invalid
    // enum literal, a 500 on every click of that tab), since 'all' isn't
    // a real ProviderStatus value.
    const where: any = status && status !== 'all' ? { status } : {};
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
        // Not best-effort: without an AccountRole, this provider has
        // nothing to ever resolve/switch into and stays locked out of the
        // role they were just approved for. See
        // RoleContextService.syncOperationalRole.
        await this.roleContextService.syncOperationalRole({
          userId: p.userId,
          roleType: AccountRoleType.TRANSPORT_PROVIDER,
          status: AccountRoleStatus.ACTIVE,
          profileType: RoleProfileType.TRANSPORT_PROVIDER,
          profileId: p.id,
        });
      }
    } else if (!approve && p.userId) {
      await this.roleContextService.syncOperationalRole({
        userId: p.userId,
        roleType: AccountRoleType.TRANSPORT_PROVIDER,
        status: AccountRoleStatus.REJECTED,
        profileType: RoleProfileType.TRANSPORT_PROVIDER,
        profileId: p.id,
      }).catch(() => {});
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
