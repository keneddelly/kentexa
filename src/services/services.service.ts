/**
 * ServicesService — Service marketplace business logic
 * Place at: src/services/services.service.ts
 */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ServiceAd, ServiceStatus } from './entities/service-ad.entity';
import { JobRequest, JobStatus } from './entities/job-request.entity';
import { User } from '../users/entities/user.entity';
import { FeedService } from '../feed/feed.service';
import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';
import { CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(ServiceAd) private adRepo: Repository<ServiceAd>,
    @InjectRepository(JobRequest) private jobRepo: Repository<JobRequest>,
    private readonly feedService: FeedService,
    private readonly commerceProfiles: CommerceProfilesService,
  ) {}

  // ── Create / Edit Service Ad ──────────────────────────────────────────────

  async createAd(user: User, dto: Partial<ServiceAd>): Promise<ServiceAd> {
    const saved = await this.adRepo.save(
      this.adRepo.create({
        ...dto,
        providerId: user.id,
        status: ServiceStatus.ACTIVE,
        totalJobs: 0,
        rating: 0,
        views: 0,
      }),
    );

    // Auto-share as a Moment — fire-and-forget, never blocks ad creation
    if (user?.id) {
      this.feedService
        .publish(user.id, {
          type: 'moment',
          title: saved.title,
          imageUrl: saved.images?.[0] || undefined,
          linkedEntityType: 'service',
          linkedEntityId: saved.id,
        })
        .catch(() => {});
    }

    return saved;
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
    return this.adRepo.save(ad);
  }

  async deleteAd(userId: number, adId: number): Promise<void> {
    const ad = await this.adRepo.findOne({
      where: { id: adId, providerId: userId },
    });
    if (!ad) throw new NotFoundException('Tangazo halijapatikana');
    ad.status = ServiceStatus.INACTIVE;
    await this.adRepo.save(ad);
  }

  async getMyAds(userId: number): Promise<ServiceAd[]> {
    return this.adRepo.find({
      where: { providerId: userId },
      order: { createdAt: 'DESC' },
    });
  }

  // Public — active service ads for a given provider, backing the
  // Services section on a Business/Service Provider/Agent CommerceProfile
  // page. Unlike getMyAds() (own, any status), this only ever shows what
  // a visitor should see.
  async findByProvider(providerId: number): Promise<ServiceAd[]> {
    return this.adRepo.find({
      where: { providerId, status: ServiceStatus.ACTIVE },
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
  }): Promise<{ ads: ServiceAd[]; total: number }> {
    const qb = this.adRepo
      .createQueryBuilder('a')
      .leftJoin('a.provider', 'u')
      .addSelect([
        'u.id',
        'u.name',
        'u.storeName',
        'u.logo',
        'u.businessLocation',
        'u.reputationScore',
        'u.followersCount',
        'u.isVerified',
        'u.isOfficialStore',
        'u.storeWhatsApp',
        'u.phone',
        'u.role',
      ])
      .where("a.status = 'active'");

    if (params.category)
      qb.andWhere('a.category = :cat', { cat: params.category });
    if (params.city)
      qb.andWhere('LOWER(a.coverageCity) LIKE LOWER(:city)', {
        city: `%${params.city}%`,
      });
    if (params.q)
      qb.andWhere(
        '(LOWER(a.title) LIKE LOWER(:q) OR LOWER(a.description) LIKE LOWER(:q))',
        { q: `%${params.q}%` },
      );
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

    return { ads, total };
  }

  async getById(id: number) {
    const ad = await this.adRepo.findOne({
      where: { id, status: ServiceStatus.ACTIVE },
      relations: { provider: true },
    });
    if (!ad) throw new NotFoundException('Huduma haijapatikana');
    // Increment views
    await this.adRepo.update(id, { views: () => 'views + 1' });

    // No dedicated "service provider" operational entity/CommerceProfile
    // creation flow exists yet (unlike seller/hub/transport/agent) — the
    // closest real identity to attach is the provider's BUSINESS profile,
    // if they happen to have one (e.g. a seller who also offers repairs).
    // Falls back to null → frontend's existing personal-profile default,
    // same honest fallback as ProductsService/ClassifiedsService.findOne().
    const commerceProfile = ad.provider
      ? await this.commerceProfiles
          .findForUserByType(ad.provider.id, CommerceProfileType.BUSINESS)
          .catch(() => null)
      : null;

    return {
      ...ad,
      commerceProfile: commerceProfile
        ? {
            id: commerceProfile.id,
            username: commerceProfile.username,
            displayName: commerceProfile.displayName,
            photoUrl: commerceProfile.photoUrl,
            followersCount: commerceProfile.followersCount,
            rating: commerceProfile.rating,
          }
        : null,
    };
  }

  async getFeatured(limit = 8): Promise<ServiceAd[]> {
    return this.adRepo.find({
      where: { status: ServiceStatus.ACTIVE, isVerified: true },
      order: { rating: 'DESC', totalJobs: 'DESC' },
      relations: { provider: true },
      take: limit,
    });
  }

  async getByCategory(category: string, limit = 12): Promise<ServiceAd[]> {
    return this.adRepo.find({
      where: { status: ServiceStatus.ACTIVE, category: category as any },
      order: { rating: 'DESC', totalJobs: 'DESC' },
      relations: { provider: true },
      take: limit,
    });
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
  async search(query: string): Promise<ServiceAd[]> {
    return this.adRepo
      .createQueryBuilder('a')
      .leftJoin('a.provider', 'u')
      .addSelect([
        'u.id',
        'u.name',
        'u.storeName',
        'u.logo',
        'u.businessLocation',
        'u.reputationScore',
        'u.followersCount',
        'u.isVerified',
        'u.isOfficialStore',
        'u.storeWhatsApp',
        'u.phone',
        'u.role',
      ])
      .where("a.status = 'active'")
      .andWhere(
        `(LOWER(a.title) LIKE :q
          OR LOWER(a.description) LIKE :q
          OR LOWER(a.category::text) LIKE :q
          OR LOWER(a."coverageCity") LIKE :q)`,
        { q: `%${query.toLowerCase()}%` },
      )
      .orderBy('COALESCE(CAST(u."reputationScore" AS int), 0)', 'DESC')
      .addOrderBy('a.rating', 'DESC')
      .take(20)
      .getMany();
  }
}
