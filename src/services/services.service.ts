/**
 * ServicesService — Service marketplace business logic
 * Place at: src/services/services.service.ts
 */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import { ServiceAd, ServiceStatus } from './entities/service-ad.entity';
import { JobRequest, JobStatus } from './entities/job-request.entity';
import { ServiceProvider } from '../service-providers/entities/service-provider.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType } from '../role-context/entities/account-role.entity';
import { User } from '../users/entities/user.entity';
import { FeedService } from '../feed/feed.service';
import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';
import { CommerceProfileScopeService } from '../commerce-profiles/commerce-profile-scope.service';
import { CommerceProfile, CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';
import { SearchIndexService } from '../search/search-index.service';
import { normalizeSearchQuery } from '../search/search-term-normalizer.util';
import { buildMultiTermLikeClause } from '../search/search-query.util';

// B6D-P0 — minimal public projections. Never the raw User/CommerceProfile
// entity: only the fields actually consumed by public Service UI
// (ServiceDetail.js/Services.js/Search.js), confirmed by grep before this
// was written. In particular this excludes email, payout*, storeName/logo/
// businessLocation, and every other User column that a bare
// `relations: { provider: true }` load would otherwise have serialized
// straight into a public, unauthenticated response.
interface PublicServiceProvider {
  id: number;
  name: string | null;
  phone: string | null;
  reputationScore: number;
}

interface PublicServiceActor {
  id: number;
  displayName: string;
  photoUrl: string | null;
}

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(ServiceAd) private adRepo: Repository<ServiceAd>,
    @InjectRepository(JobRequest) private jobRepo: Repository<JobRequest>,
    private readonly feedService: FeedService,
    private readonly commerceProfiles: CommerceProfilesService,
    private readonly profileScope: CommerceProfileScopeService,
    private readonly searchIndex: SearchIndexService,
  ) {}

  private toPublicProvider(user?: { id: number; name: string | null; phone: string | null; reputationScore?: number | null } | null): PublicServiceProvider | null {
    if (!user) return null;
    return { id: user.id, name: user.name ?? null, phone: user.phone ?? null, reputationScore: Number(user.reputationScore || 0) };
  }

  private toPublicActor(profile: CommerceProfile): PublicServiceActor {
    return { id: profile.id, displayName: profile.displayName, photoUrl: profile.photoUrl };
  }

  /**
   * THE canonical public-actor resolver for a single ServiceAd (B6D-P0).
   *
   * Business attribution is resolved ONLY via the ad's own businessId --
   * never "any Business this provider happens to own" (that ambiguity is
   * exactly what let a Business A service resolve to Business B's
   * identity, or a Personal service resolve to an unrelated Business, when
   * a provider ran more than one). Personal attribution is resolved ONLY
   * via the ad's own commerceProfileId. A legacy/ambiguous ad (both null --
   * predates these columns, or a creation context that never resolved one)
   * fails toward the poster's own Personal CommerceProfile, deterministically
   * -- never an inferred Business.
   */
  private async resolvePublicActor(ad: ServiceAd): Promise<PublicServiceActor | null> {
    const profileRepo = this.adRepo.manager.getRepository(CommerceProfile);
    if (ad.businessId != null) {
      const profile = await profileRepo.findOne({ where: { businessId: ad.businessId } });
      return profile ? this.toPublicActor(profile) : null;
    }
    if (ad.commerceProfileId != null) {
      const profile = await profileRepo.findOne({ where: { id: ad.commerceProfileId } });
      return profile ? this.toPublicActor(profile) : null;
    }
    const personal = await profileRepo.findOne({ where: { ownerId: ad.providerId, type: CommerceProfileType.PERSONAL } });
    return personal ? this.toPublicActor(personal) : null;
  }

  /**
   * Batched version of resolvePublicActor() for list responses (browse/
   * search/featured/category) -- a small, fixed number of extra queries
   * regardless of list size, never one query per row.
   */
  private async resolvePublicActorsForAds(ads: ServiceAd[]): Promise<Map<number, PublicServiceActor>> {
    const result = new Map<number, PublicServiceActor>();
    if (ads.length === 0) return result;
    const profileRepo = this.adRepo.manager.getRepository(CommerceProfile);

    const businessIds = [...new Set(ads.filter((a) => a.businessId != null).map((a) => a.businessId as number))];
    const commerceProfileIds = [...new Set(ads.filter((a) => a.businessId == null && a.commerceProfileId != null).map((a) => a.commerceProfileId as number))];
    const legacyProviderIds = [...new Set(ads.filter((a) => a.businessId == null && a.commerceProfileId == null).map((a) => a.providerId))];

    const [byBusiness, byId, byOwnerPersonal] = await Promise.all([
      businessIds.length ? profileRepo.find({ where: { businessId: In(businessIds) } }) : Promise.resolve([]),
      commerceProfileIds.length ? profileRepo.find({ where: { id: In(commerceProfileIds) } }) : Promise.resolve([]),
      legacyProviderIds.length ? profileRepo.find({ where: { ownerId: In(legacyProviderIds), type: CommerceProfileType.PERSONAL } }) : Promise.resolve([]),
    ]);

    const businessMap = new Map(byBusiness.map((p) => [p.businessId as number, p]));
    const idMap = new Map(byId.map((p) => [p.id, p]));
    const personalByOwnerMap = new Map(byOwnerPersonal.map((p) => [p.ownerId, p]));

    for (const ad of ads) {
      let profile: CommerceProfile | undefined;
      if (ad.businessId != null) profile = businessMap.get(ad.businessId);
      else if (ad.commerceProfileId != null) profile = idMap.get(ad.commerceProfileId);
      else profile = personalByOwnerMap.get(ad.providerId);
      if (profile) result.set(ad.id, this.toPublicActor(profile));
    }
    return result;
  }

  /**
   * Attaches the curated public provider + canonical actor to a page of
   * ads in one pass -- shared by getById()/browse()/search()/getFeatured()/
   * getByCategory() so every public read path represents identity
   * identically, never a raw User relation.
   */
  private async attachPublicIdentity(ads: ServiceAd[]): Promise<any[]> {
    if (ads.length === 0) return [];
    const providerIds = [...new Set(ads.map((a) => a.providerId))];
    const [providers, actorMap] = await Promise.all([
      this.adRepo.manager.getRepository(User).find({
        where: { id: In(providerIds) },
        select: { id: true, name: true, phone: true, reputationScore: true },
      }),
      this.resolvePublicActorsForAds(ads),
    ]);
    const providerMap = new Map(providers.map((p) => [p.id, p]));
    return ads.map((ad) => ({
      ...ad,
      provider: this.toPublicProvider(providerMap.get(ad.providerId)),
      commerceProfile: actorMap.get(ad.id) ?? null,
    }));
  }

  // ── Create / Edit Service Ad ──────────────────────────────────────────────

  async createAd(user: User, dto: Partial<ServiceAd> & { commerceProfileId?: number }): Promise<ServiceAd> {
    // Attributes the ad to whichever profile was active when it was posted
    // — same fix already applied to Classifieds/Products/Moments.
    // Authorization is never trusted from the client.
    let commerceProfileId: number | null = null;
    if (dto.commerceProfileId) {
      const authorized = await this.profileScope.isAuthorizedFor(
        user.id,
        dto.commerceProfileId,
        'canManageProducts',
      );
      if (!authorized) {
        throw new ForbiddenException('You do not manage this commerce profile');
      }
      commerceProfileId = dto.commerceProfileId;
    }

    const saved = await this.adRepo.save(
      this.adRepo.create({
        ...dto,
        providerId: user.id,
        commerceProfileId,
        status: ServiceStatus.ACTIVE,
        totalJobs: 0,
        rating: 0,
        views: 0,
      }),
    );

    // Auto-share as a Moment — fire-and-forget, never blocks ad creation.
    // price is passed as real data (not burned into the image pixels — see
    // the removed price-overlay.util) so HomeFeed.js's existing clean price
    // badge renders for this instead of a cluttered on-image banner.
    // No price at all for negotiate/free-quote ads — there's no fixed
    // number to show (the badge only ever renders a plain number, never a
    // range/unit label, so a negotiated price has nothing accurate to show).
    const hasFixedPrice =
      saved.priceType !== 'negotiate' &&
      saved.priceType !== 'free_quote' &&
      Number(saved.price) > 0;
    if (user?.id) {
      this.feedService
        .publish(user.id, {
          type: 'moment',
          title: saved.title,
          imageUrl: saved.images?.[0],
          linkedEntityType: 'service',
          linkedEntityId: saved.id,
          category: saved.category || undefined,
          price: hasFixedPrice ? Number(saved.price) : undefined,
          commerceProfileId: commerceProfileId || undefined,
        })
        .catch(() => {});
    }

    this.searchIndex
      .upsert('service', saved.id, [saved.title, saved.description, saved.category, saved.coverageCity].filter(Boolean).join(' \n '))
      .catch(() => {});

    return saved;
  }

  /**
   * Business Capability Activation Stage B6B -- FOUNDATION ONLY. No
   * controller/route wires into this method yet (that is B6C/B6D's job,
   * per the mission's own explicit scope boundary); it exists to prove
   * the server-derived-authority contract and is exercised directly by
   * the real-Postgres test suite. Takes the caller's OWN already-resolved
   * AccountRole -- never a client-supplied businessId/workspaceId/
   * serviceProviderId/accountRoleId. createAd() above (the existing
   * personal-context creation path) is completely untouched by this
   * method's addition.
   */
  async createBusinessServiceAd(
    activeRole: AccountRole,
    dto: Partial<ServiceAd>,
  ): Promise<ServiceAd> {
    if (activeRole.roleType !== AccountRoleType.SERVICE_PROVIDER || activeRole.status !== AccountRoleStatus.ACTIVE) {
      throw new ForbiddenException({ code: 'SERVICE_PROVIDER_ROLE_REQUIRED', message: 'SERVICE_PROVIDER_ROLE_REQUIRED' });
    }
    const provider = await this.adRepo.manager.getRepository(ServiceProvider)
      .findOne({ where: { id: activeRole.profileId ?? -1 } });
    if (!provider || provider.businessId == null) {
      // The role passed a structural check above but doesn't resolve to a
      // real, Business-bound ServiceProvider -- fail closed rather than
      // fall back to a personal-style creation the caller never asked for.
      throw new ConflictException({ code: 'SERVICE_PROVIDER_NOT_BUSINESS_BOUND', message: 'SERVICE_PROVIDER_NOT_BUSINESS_BOUND' });
    }

    const saved = await this.adRepo.save(this.adRepo.create({
      ...dto,
      providerId: activeRole.userId,
      businessId: provider.businessId,
      commerceProfileId: null,
      status: ServiceStatus.ACTIVE,
      totalJobs: 0,
      rating: 0,
      views: 0,
    }));

    this.searchIndex
      .upsert('service', saved.id, [saved.title, saved.description, saved.category, saved.coverageCity].filter(Boolean).join(' \n '))
      .catch(() => {});

    return saved;
  }

  /**
   * B6C — controller-facing entry point for createBusinessServiceAd().
   * Resolves the real, current AccountRole entity from the caller's own
   * authoritative RoleContext.accountRoleId (never trusts a client-
   * supplied role/profile id) via the same manager.getRepository(X)
   * pattern already used above for ServiceProvider, so no new
   * constructor-injected repository is needed here either.
   * createBusinessServiceAd() itself is untouched.
   */
  async createBusinessServiceAdForRoleContext(
    userId: number,
    accountRoleId: number,
    dto: Partial<ServiceAd>,
  ): Promise<ServiceAd> {
    const role = await this.adRepo.manager.getRepository(AccountRole).findOne({
      where: { id: accountRoleId, userId },
    });
    if (!role) {
      throw new ForbiddenException({ code: 'SERVICE_PROVIDER_ROLE_REQUIRED', message: 'SERVICE_PROVIDER_ROLE_REQUIRED' });
    }
    return this.createBusinessServiceAd(role, dto);
  }

  async updateAd(
    userId: number,
    adId: number,
    dto: Partial<ServiceAd>,
  ): Promise<ServiceAd> {
    const ad = await this.adRepo.findOne({
      where: { id: adId, providerId: userId },
    });
    if (!ad) throw new NotFoundException('Tangazo halijapatikana');
    // images is required at creation (CreateServiceAdDto) — an update that
    // explicitly sends an empty array must not be allowed to null it back
    // out. A field simply absent from the update payload is untouched,
    // same as every other field here.
    if (dto.images?.length === 0) {
      throw new BadRequestException('Huduma lazima iwe na picha angalau moja');
    }
    const allowed = [
      'title',
      'description',
      'category',
      'subcategory',
      'priceType',
      'price',
      'priceMax',
      'coverageCity',
      'coverageWards',
      'workingDays',
      'workingHours',
      'isAvailableNow',
      'images',
      'whatsappPhone',
      'status',
      'isAvailableForBooking',
    ];
    for (const key of allowed) {
      if ((dto as any)[key] !== undefined) (ad as any)[key] = (dto as any)[key];
    }
    const saved = await this.adRepo.save(ad);
    this.searchIndex
      .upsert('service', saved.id, [saved.title, saved.description, saved.category, saved.coverageCity].filter(Boolean).join(' \n '))
      .catch(() => {});
    return saved;
  }

  async deleteAd(userId: number, adId: number): Promise<void> {
    const ad = await this.adRepo.findOne({
      where: { id: adId, providerId: userId },
    });
    if (!ad) throw new NotFoundException('Tangazo halijapatikana');
    ad.status = ServiceStatus.INACTIVE;
    await this.adRepo.save(ad);
    this.searchIndex.remove('service', ad.id).catch(() => {});
  }

  // commerceProfileId optional and NULL-fallback-scoped, matching the
  // pattern used everywhere else this session (Products/Classifieds) —
  // an ad tagged to one profile (or predating this column entirely) still
  // resolves for its owner; a Personal and Business profile on the same
  // account stop sharing each other's ads only once a caller actually
  // passes commerceProfileId.
  // B6C: businessId scopes to ads created via createBusinessServiceAd() for
  // that exact Business — those always have commerceProfileId: null, so a
  // Personal-scoped query (commerceProfileId given, businessId omitted)
  // must exclude businessId-tagged rows from its own legacy-untagged
  // fallback, or a Business's ads would silently leak into "My Services"
  // under the same account's Personal profile (the same identity-collapse
  // failure mode Identity Fix I1 closed for Classifieds/Products).
  async getMyAds(userId: number, commerceProfileId?: number, businessId?: number): Promise<ServiceAd[]> {
    if (businessId != null) {
      return this.adRepo.find({
        where: { providerId: userId, businessId },
        order: { createdAt: 'DESC' },
      });
    }
    return this.adRepo.find({
      where: commerceProfileId
        ? [
            { providerId: userId, commerceProfileId },
            { providerId: userId, commerceProfileId: IsNull(), businessId: IsNull() },
          ]
        : { providerId: userId },
      order: { createdAt: 'DESC' },
    });
  }

  // Public — active service ads for a given provider, backing the
  // Services section on a Business/Service Provider/Agent CommerceProfile
  // page. Unlike getMyAds() (own, any status), this only ever shows what
  // a visitor should see.
  //
  // Deprecated in favor of findForCommerceProfile() (B6D-P0): this scopes
  // only by the raw human owner, which mixes Personal + every Business the
  // same account runs into one list. Kept, unchanged, in case an
  // undocumented caller still depends on it -- CommerceProfile.js itself
  // no longer calls this.
  async findByProvider(providerId: number): Promise<ServiceAd[]> {
    return this.adRepo.find({
      where: { providerId, status: ServiceStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });
  }

  // Public — Services scoped to the EXACT CommerceProfile being viewed
  // (B6D-P0). A Business-type profile resolves to that Business's own
  // businessId-tagged ads; any other profile type resolves to its own
  // commerceProfileId-tagged ads. Replaces findByProvider(providerId) as
  // CommerceProfile.js's Services-tab backing call, so two Businesses (or
  // a Business and its owner's Personal profile) never show each other's
  // services.
  async findForCommerceProfile(commerceProfileId: number): Promise<ServiceAd[]> {
    const profile = await this.adRepo.manager
      .getRepository(CommerceProfile)
      .findOne({ where: { id: commerceProfileId } });
    if (!profile) return [];
    if (profile.businessId != null) {
      return this.adRepo.find({
        where: { businessId: profile.businessId, status: ServiceStatus.ACTIVE },
        order: { createdAt: 'DESC' },
      });
    }
    return this.adRepo.find({
      where: { commerceProfileId, status: ServiceStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });
  }

  // ── Browse / Search ───────────────────────────────────────────────────────

  async browse(params: {
    category?: string;
    city?: string;
    q?: string;
    available?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ ads: any[]; total: number }> {
    // No join/addSelect of the provider User at all here (B6D-P0) — none
    // of browse()'s own sort keys (isVerified/rating/totalJobs/createdAt)
    // need it, and identity is attached afterward via the shared,
    // privacy-curated attachPublicIdentity() helper instead of selecting
    // raw User columns (previously: storeName/logo/businessLocation/
    // followersCount/isOfficialStore/storeWhatsApp/phone/role, none of
    // which the frontend actually reads from a browse-card).
    const qb = this.adRepo.createQueryBuilder('a').where("a.status = 'active'");

    if (params.category)
      qb.andWhere('a.category = :cat', { cat: params.category });
    if (params.city)
      qb.andWhere('LOWER(a.coverageCity) LIKE LOWER(:city)', {
        city: `%${params.city}%`,
      });
    if (params.q) {
      // Query normalization layer — see search-term-normalizer.util.ts.
      const { patterns } = normalizeSearchQuery(params.q);
      const { clause, params: likeParams } = buildMultiTermLikeClause(
        ['LOWER(a.title)', 'LOWER(a.description)'],
        patterns,
        'kw',
      );
      qb.andWhere(clause, likeParams);
    }
    if (params.available) qb.andWhere('a.isAvailableNow = true');

    const total = await qb.getCount();
    const ads = await qb
      .orderBy('a.isVerified', 'DESC')
      .addOrderBy('a.rating', 'DESC')
      .addOrderBy('a.totalJobs', 'DESC')
      .addOrderBy('a.createdAt', 'DESC')
      .take(params.limit || 20)
      .skip(params.offset || 0)
      .getMany();

    return { ads: await this.attachPublicIdentity(ads), total };
  }

  async getById(id: number) {
    // No relations: { provider: true } (B6D-P0) — that loaded the FULL raw
    // User entity (email, phone, payoutMethod/AccountName/AccountNumber/
    // BankName/BranchName, storeWhatsApp, ...) straight into this public,
    // unauthenticated response. Identity is attached afterward via the
    // same curated attachPublicIdentity() helper every public read path
    // now shares, and the actor is resolved from THIS ad's own
    // commerceProfileId/businessId — never an unconditional "does this
    // provider have any Business profile" lookup, which could (and did)
    // attach a wrong or unrelated Business's identity.
    const ad = await this.adRepo.findOne({
      where: { id, status: ServiceStatus.ACTIVE },
    });
    if (!ad) throw new NotFoundException('Huduma haijapatikana');
    await this.adRepo.update(id, { views: () => 'views + 1' });

    const [withIdentity] = await this.attachPublicIdentity([ad]);
    return withIdentity;
  }

  async getFeatured(limit = 8): Promise<any[]> {
    const ads = await this.adRepo.find({
      where: { status: ServiceStatus.ACTIVE, isVerified: true },
      order: { rating: 'DESC', totalJobs: 'DESC' },
      take: limit,
    });
    return this.attachPublicIdentity(ads);
  }

  async getByCategory(category: string, limit = 12): Promise<any[]> {
    const ads = await this.adRepo.find({
      where: { status: ServiceStatus.ACTIVE, category: category as any },
      order: { rating: 'DESC', totalJobs: 'DESC' },
      take: limit,
    });
    return this.attachPublicIdentity(ads);
  }

  // ── Job Requests ──────────────────────────────────────────────────────────

  async createJobRequest(
    buyer: User,
    dto: {
      serviceAdId: number;
      description: string;
      jobLocation: string;
      preferredDate?: string;
      preferredTime?: string;
      buyerPhone?: string;
    },
  ): Promise<JobRequest> {
    const ad = await this.adRepo.findOne({
      where: { id: dto.serviceAdId, status: ServiceStatus.ACTIVE },
    });
    if (!ad) throw new NotFoundException('Huduma haijapatikana');
    if (ad.providerId === buyer.id)
      throw new BadRequestException('Huwezi kuomba huduma yako mwenyewe');

    // Check no duplicate pending request
    const existing = await this.jobRepo.findOne({
      where: {
        buyerId: buyer.id,
        serviceAdId: dto.serviceAdId,
        status: JobStatus.PENDING,
      },
    });
    if (existing)
      throw new BadRequestException(
        'Tayari una ombi linalosubiri kwa huduma hii',
      );

    return this.jobRepo.save(
      this.jobRepo.create({
        buyerId: buyer.id,
        serviceAdId: dto.serviceAdId,
        providerId: ad.providerId,
        description: dto.description,
        jobLocation: dto.jobLocation,
        preferredDate: dto.preferredDate || null,
        preferredTime: dto.preferredTime || null,
        buyerPhone: dto.buyerPhone || buyer.phone || null,
        status: JobStatus.PENDING,
      }),
    );
  }

  // Provider responds
  async respondToJob(
    providerId: number,
    jobId: number,
    dto: {
      accept: boolean;
      agreedPrice?: number;
      providerNote?: string;
    },
  ): Promise<JobRequest> {
    const job = await this.jobRepo.findOne({
      where: { id: jobId, providerId, status: JobStatus.PENDING },
    });
    if (!job) throw new NotFoundException('Ombi halijapatikana');

    job.status = dto.accept ? JobStatus.ACCEPTED : JobStatus.DECLINED;
    job.agreedPrice = dto.agreedPrice || null;
    job.providerNote = dto.providerNote || null;
    job.acceptedAt = dto.accept ? new Date() : null;
    return this.jobRepo.save(job);
  }

  // Legal status transitions + which side of the job may make them. Without
  // this, either party could set a job to any status — including a buyer
  // marking COMPLETED without the provider ever starting the work, which
  // inflated that provider's totalJobs stat for free.
  private static readonly JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
    [JobStatus.PENDING]: [
      JobStatus.ACCEPTED,
      JobStatus.DECLINED,
      JobStatus.CANCELLED,
    ],
    [JobStatus.ACCEPTED]: [
      JobStatus.IN_PROGRESS,
      JobStatus.CANCELLED,
      JobStatus.DISPUTED,
    ],
    [JobStatus.IN_PROGRESS]: [JobStatus.COMPLETED, JobStatus.DISPUTED],
    [JobStatus.COMPLETED]: [JobStatus.DISPUTED],
    [JobStatus.DECLINED]: [],
    [JobStatus.CANCELLED]: [],
    [JobStatus.DISPUTED]: [],
  };

  private static readonly PROVIDER_ONLY_STATUSES = new Set<JobStatus>([
    JobStatus.ACCEPTED,
    JobStatus.DECLINED,
    JobStatus.IN_PROGRESS,
    JobStatus.COMPLETED,
  ]);

  private static readonly BUYER_ONLY_STATUSES = new Set<JobStatus>([
    JobStatus.CANCELLED,
  ]);

  // Update job status
  async updateJobStatus(
    userId: number,
    jobId: number,
    status: JobStatus,
    note?: string,
  ): Promise<JobRequest> {
    const job = await this.jobRepo.findOne({
      where: [
        { id: jobId, providerId: userId },
        { id: jobId, buyerId: userId },
      ],
    });
    if (!job) throw new NotFoundException('Kazi haijapatikana');

    const isProvider = job.providerId === userId;
    if (
      ServicesService.PROVIDER_ONLY_STATUSES.has(status) &&
      !isProvider
    ) {
      throw new BadRequestException(
        'Only the provider can set this status',
      );
    }
    if (ServicesService.BUYER_ONLY_STATUSES.has(status) && isProvider) {
      throw new BadRequestException('Only the buyer can set this status');
    }
    const allowedNext = ServicesService.JOB_TRANSITIONS[job.status] || [];
    if (!allowedNext.includes(status)) {
      throw new BadRequestException(
        `Cannot move job from ${job.status} to ${status}`,
      );
    }

    job.status = status;
    if (note) job.providerNote = note;
    if (status === JobStatus.IN_PROGRESS) job.startedAt = new Date();
    if (status === JobStatus.COMPLETED) job.completedAt = new Date();

    // Update provider stats on completion
    if (status === JobStatus.COMPLETED) {
      await this.adRepo.update(job.serviceAdId, {
        totalJobs: () => 'totalJobs + 1',
      });
    }

    return this.jobRepo.save(job);
  }

  // Leave review after completion
  async reviewJob(
    buyerId: number,
    jobId: number,
    rating: number,
    review: string,
  ): Promise<JobRequest> {
    const job = await this.jobRepo.findOne({
      where: { id: jobId, buyerId, status: JobStatus.COMPLETED },
    });
    if (!job)
      throw new NotFoundException('Kazi haijapatikana au haijamalizika');
    if (job.rating) throw new BadRequestException('Umeshakagua kazi hii');
    if (rating < 1 || rating > 5)
      throw new BadRequestException('Ukadiriaji lazima uwe kati ya 1 na 5');

    job.rating = rating;
    job.review = review;
    await this.jobRepo.save(job);

    // Update service ad rating
    const reviews = await this.jobRepo
      .createQueryBuilder('j')
      .select('AVG(j.rating)', 'avg')
      .addSelect('COUNT(j.rating)', 'count')
      .where('j.serviceAdId = :id', { id: job.serviceAdId })
      .andWhere('j.rating IS NOT NULL')
      .getRawOne();

    await this.adRepo.update(job.serviceAdId, {
      rating: Math.round(Number(reviews.avg) * 100) / 100,
      totalRatings: Number(reviews.count),
    });

    return job;
  }

  // Get jobs for provider
  async getMyJobs(providerId: number, status?: string): Promise<JobRequest[]> {
    const qb = this.jobRepo
      .createQueryBuilder('j')
      .leftJoinAndSelect('j.buyer', 'buyer')
      .where('j.providerId = :pid', { pid: providerId });
    if (status) qb.andWhere('j.status = :status', { status });
    const jobs = await qb.orderBy('j.createdAt', 'DESC').getMany();
    // Manually attach serviceAd title for display
    const adIds = [...new Set(jobs.map((j) => j.serviceAdId))];
    let adsMap: Record<number, any> = {};
    if (adIds.length > 0) {
      const ads = await this.adRepo.findBy({ id: In(adIds) });
      adsMap = Object.fromEntries(ads.map((a) => [a.id, a]));
    }
    return jobs.map((j) => ({
      ...j,
      serviceAd: adsMap[j.serviceAdId] || null,
    }));
  }

  // Get requests made by buyer
  async getMyRequests(buyerId: number): Promise<JobRequest[]> {
    const jobs = await this.jobRepo.find({
      where: { buyerId },
      order: { createdAt: 'DESC' },
    });
    const adIds = [...new Set(jobs.map((j) => j.serviceAdId))];
    let adsMap: Record<number, any> = {};
    if (adIds.length > 0) {
      const ads = await this.adRepo.findBy({ id: In(adIds) });
      adsMap = Object.fromEntries(ads.map((a) => [a.id, a]));
    }
    return jobs.map((j) => ({
      ...j,
      serviceAd: adsMap[j.serviceAdId] || null,
    }));
  }
  // ── Unified search ────────────────────────────────────────────────────────
  async search(query: string): Promise<any[]> {
    // Query normalization layer — see search-term-normalizer.util.ts.
    const { patterns } = normalizeSearchQuery(query);
    const { clause, params } = buildMultiTermLikeClause(
      ['LOWER(a.title)', 'LOWER(a.description)', 'LOWER(a.category::text)', 'LOWER(a."coverageCity")'],
      patterns,
      'kw',
    );

    // Reputation ranking via a scalar subquery, not a join (B6D-P0) — a
    // real, pre-existing TypeORM limitation: any query combining a JOIN
    // with .take()/.skip() forces TypeORM into a special DISTINCT-
    // pagination rewrite path that naively splits a raw ORDER BY string on
    // "." to find a join alias, which breaks on a complex expression like
    // the one this sort needs (discovered by this stage's own real-
    // Postgres test, not present before since search() apparently had no
    // prior real-Postgres execution proof). A subquery sidesteps that path
    // entirely while preserving the exact same ranking, and never selects
    // any User column at all, so there's nothing to leak on the ad entity
    // itself either way — identity is attached afterward via the shared,
    // privacy-curated attachPublicIdentity() helper.
    const ads = await this.adRepo
      .createQueryBuilder('a')
      .where("a.status = 'active'")
      .andWhere(clause, params)
      .orderBy(
        'COALESCE((SELECT CAST(u."reputationScore" AS int) FROM "user" u WHERE u.id = a."providerId"), 0)',
        'DESC',
      )
      .addOrderBy('a.rating', 'DESC')
      .take(20)
      .getMany();

    return this.attachPublicIdentity(ads);
  }

  // ── Admin: every service ad regardless of status ──────────────────────────
  // browse()/search() only ever return status='active' ads, so there was no
  // way for an admin to see the full picture (paused/inactive ads included)
  // — mirrors ProductsService.findAllAdmin()'s exact same reasoning.
  async findAllAdmin(): Promise<ServiceAd[]> {
    return this.adRepo.find({
      relations: { provider: true },
      order: { createdAt: 'DESC' },
    });
  }

  async setStatusAdmin(id: number, status: ServiceStatus): Promise<ServiceAd> {
    const ad = await this.adRepo.findOne({ where: { id } });
    if (!ad) throw new NotFoundException('Huduma haijapatikana');
    ad.status = status;
    return this.adRepo.save(ad);
  }
}
