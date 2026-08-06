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
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { ConversationService } from '../business/conversation.service';
import { MessageType } from '../business/entities/conversation-message.entity';

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(ServiceAd) private adRepo: Repository<ServiceAd>,
    @InjectRepository(JobRequest) private jobRepo: Repository<JobRequest>,
    private readonly feedService: FeedService,
    private readonly notifService: InAppNotificationService,
    private readonly conversationService: ConversationService,
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

  async getById(id: number): Promise<ServiceAd> {
    const ad = await this.adRepo.findOne({
      where: { id, status: ServiceStatus.ACTIVE },
      relations: { provider: true },
    });
    if (!ad) throw new NotFoundException('Huduma haijapatikana');
    // Increment views
    await this.adRepo.update(id, { views: () => 'views + 1' });
    return ad;
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

    const job = await this.jobRepo.save(
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

    // Notify the provider — this was completely missing before, so
    // service requests silently sat in "My Requests" with no alert at all.
    this.notifService
      .notify({
        userId: ad.providerId,
        type: 'service_request',
        title: '🔧 Ombi Jipya la Huduma',
        body: `${buyer.name || buyer.storeName || 'Mteja'}: ${dto.description?.slice(0, 80) || ad.title}`,
        icon: '🔧',
        actionPage: 'MyServices',
      })
      .catch(() => {});

    // Link this request to the buyer↔provider conversation so the whole
    // negotiation (request → accept/decline → follow-up) lives in the
    // unified inbox instead of being a disconnected system. Non-fatal —
    // the job request itself must never be blocked by this.
    try {
      const convo = await this.conversationService.getOrCreateConversationAsBuyer(
        buyer,
        ad.providerId,
      );
      await this.jobRepo.update(job.id, { conversationId: convo.id });
      await this.conversationService.linkJobRequest(convo.id, job.id);
      await this.conversationService.sendMessageAsBuyer(
        buyer.id,
        convo.id,
        {
          type: MessageType.JOB,
          content: `Ombi la huduma: ${ad.title}`,
          metadata: {
            jobRequestId: job.id,
            serviceTitle: ad.title,
            status: 'pending',
            description: dto.description,
            jobLocation: dto.jobLocation,
            preferredDate: dto.preferredDate || null,
          },
        },
        buyer,
      );
    } catch (e) {
      console.error('Failed to link job request to conversation:', e.message);
    }

    return job;
  }

  // Provider responds
  async respondToJob(
    provider: User,
    jobId: number,
    dto: {
      accept: boolean;
      agreedPrice?: number;
      providerNote?: string;
    },
  ): Promise<JobRequest> {
    const job = await this.jobRepo.findOne({
      where: { id: jobId, providerId: provider.id, status: JobStatus.PENDING },
    });
    if (!job) throw new NotFoundException('Ombi halijapatikana');

    job.status = dto.accept ? JobStatus.ACCEPTED : JobStatus.DECLINED;
    job.agreedPrice = dto.agreedPrice || null;
    job.providerNote = dto.providerNote || null;
    job.acceptedAt = dto.accept ? new Date() : null;
    const saved = await this.jobRepo.save(job);

    // Notify the buyer of the provider's response — same gap as the
    // buyer→provider direction above. Deep-links to the listing as a
    // fallback; the chat message below (when a linked conversation exists)
    // is the more immediate, visible channel.
    const ad = await this.adRepo.findOne({ where: { id: job.serviceAdId } });
    this.notifService
      .notify({
        userId: job.buyerId,
        type: 'service_request',
        title: dto.accept ? '✅ Ombi Limekubaliwa' : '❌ Ombi Limekataliwa',
        body: ad?.title || 'Ombi lako la huduma',
        icon: dto.accept ? '✅' : '❌',
        actionPage: 'ServiceDetail',
        actionParam: String(job.serviceAdId),
      })
      .catch(() => {});

    // Post the outcome back into the linked conversation, if one exists.
    if (job.conversationId) {
      try {
        await this.conversationService.sendMessage(
          provider.id,
          job.conversationId,
          {
            type: MessageType.JOB,
            content: dto.accept
              ? `Ombi limekubaliwa${dto.agreedPrice ? ` — TZS ${dto.agreedPrice.toLocaleString()}` : ''}`
              : 'Ombi limekataliwa',
            metadata: {
              jobRequestId: job.id,
              serviceTitle: ad?.title,
              status: saved.status,
              agreedPrice: saved.agreedPrice,
              providerNote: saved.providerNote,
            },
          },
          provider,
        );
      } catch (e) {
        console.error('Failed to post job response to conversation:', e.message);
      }
    }

    return saved;
  }

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
