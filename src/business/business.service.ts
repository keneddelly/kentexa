import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Business, BusinessStatus } from './entities/business.entity';
import { User } from '../users/entities/user.entity';
import { SellerProfile, SellerStatus } from '../seller/entities/seller-profile.entity';
import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';
import {
  CommerceProfileType,
  CommerceProfileStatus,
} from '../commerce-profiles/entities/commerce-profile.entity';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';
import { Invoice, InvoiceStatus } from '../invoices/entities/invoice.entity';
import { Product } from '../products/entities/products.entity';
import { AnalyticsService } from '../analytics/analytics.service';
import { AiBusinessInsightService } from '../ai/ai-business-insight.service';

// Phase 1 of the multi-role architecture: Business as a real entity,
// independent of Seller. See seller.service.ts's apply() for the existing
// (unchanged) individual-or-business seller application flow -- this
// service is the newer "I just want a Business profile, not to sell"
// path, plus the bridge that lets an existing Business activate Seller
// later without duplicating its own data.
@Injectable()
export class BusinessService {
  constructor(
    @InjectRepository(Business) private businessRepo: Repository<Business>,
    @InjectRepository(SellerProfile) private sellerProfileRepo: Repository<SellerProfile>,
    @InjectRepository(Invoice) private invoiceRepo: Repository<Invoice>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    private commerceProfiles: CommerceProfilesService,
    private activityEvents: ActivityEventService,
    private analytics: AnalyticsService,
    private aiInsight: AiBusinessInsightService,
  ) {}

  async findMine(userId: number): Promise<Business | null> {
    return this.businessRepo.findOne({ where: { user: { id: userId } } });
  }

  async findById(id: number): Promise<Business> {
    const business = await this.businessRepo.findOne({ where: { id } });
    if (!business) throw new NotFoundException('Business not found');
    return business;
  }

  // Own dashboard stats -- only what this Business genuinely has data for
  // today. Leads/Messages are honest empty placeholders, not real backing
  // data yet (see Phase 2 plan's "explicitly not in this phase").
  async getDashboard(businessId: number, user: User) {
    const business = await this.findById(businessId);
    if (business.user.id !== user.id) {
      throw new NotFoundException('Business not found');
    }
    const [sellerProfile, commerceProfile] = await Promise.all([
      // By user, not businessId: a SellerProfile created through the
      // original individual/business application flow (SellerService.apply)
      // has businessId null — it was never linked to this Business entity,
      // even though it's the same person's real, approved seller account.
      // activateSeller()'s own existingSeller check (below) already treats
      // "by user.id" as authoritative for this; this lookup was the one
      // place still checking businessId instead, so an approved seller
      // whose profile predates this Business record saw "Activate Seller"
      // here despite already being one.
      this.sellerProfileRepo.findOne({ where: { user: { id: user.id } } }),
      this.commerceProfiles.findForUserByType(user.id, CommerceProfileType.BUSINESS),
    ]);
    return {
      business,
      hasSeller: !!sellerProfile,
      followersCount: commerceProfile?.followersCount || 0,
      rating: commerceProfile?.rating || 0,
      reviewsCount: commerceProfile?.reviewsCount || 0,
      reputationScore: commerceProfile?.reputationScore || 0,
      leadsCount: 0,
      unreadMessagesCount: 0,
    };
  }

  // ── Layer 2 of CLAUDE.md's Internal AI Intelligence architecture:
  // deterministic analytics over the ActivityEvent bus (Phase 1), no AI
  // reasoning here. "Current state" (pending invoices) is read straight
  // from Invoice, never derived from the event log — the event log stays
  // an honest record of things that happened, not a shadow copy of state
  // that could drift from it. Only genuinely time-boxed activity ("how
  // many orders came in today") is read from ActivityEvent/AnalyticsEvent.
  // No Moments/engagement section — that feature doesn't exist yet, and
  // fabricating it would violate CLAUDE.md's "never invent activity" rule.
  async getTodayIntelligence(businessId: number, user: User) {
    const business = await this.findById(businessId);
    if (business.user.id !== user.id) {
      throw new NotFoundException('Business not found');
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const profile = await this.commerceProfiles.findForUserByType(
      user.id,
      CommerceProfileType.BUSINESS,
    );
    const profileId = profile?.id ?? null;

    const countToday = (eventType: string) =>
      profileId
        ? this.activityEvents.countSince(profileId, eventType, startOfToday)
        : Promise.resolve(0);

    const [
      ordersToday,
      paymentsCompletedToday,
      newFollowersToday,
      reviewsToday,
      pendingInvoicesCount,
      myProducts,
    ] = await Promise.all([
      countToday('ORDER_CREATED'),
      countToday('INVOICE_PAID'),
      countToday('PROFILE_FOLLOWED'),
      countToday('REVIEW_CREATED'),
      this.invoiceRepo.count({
        where: {
          order: { seller: { id: user.id } },
          status: In([
            InvoiceStatus.AWAITING_PAYMENT,
            InvoiceStatus.PAYMENT_PROCESSING,
          ]),
        },
      }),
      this.productRepo.find({
        where: { seller: { id: user.id } },
        select: { id: true },
      }),
    ]);

    const productIds = myProducts.map((p) => String(p.id));
    const [profileVisitsToday, productViewsToday] = await Promise.all([
      profileId
        ? this.analytics.countEventsSince({
            eventType: 'profile_view',
            targetType: 'profile',
            targetId: String(profileId),
            since: startOfToday,
          })
        : 0,
      this.analytics.countEventsSince({
        eventType: 'product_view',
        targetIdIn: productIds,
        since: startOfToday,
      }),
    ]);

    return {
      commerce: { ordersToday, paymentsCompletedToday, pendingInvoicesCount },
      customerActivity: {
        profileVisitsToday,
        productViewsToday,
        newFollowersToday,
        reviewsToday,
      },
    };
  }

  // Layer 4 — real AI reasoning on top of getTodayIntelligence()'s Layer 2
  // counts, called separately by the frontend AFTER that deterministic
  // report already rendered (never a dependency of it). `today` is the
  // exact object the frontend already got back from getTodayIntelligence()
  // — passed in rather than refetched, same reasoning AiSearchExplainerService
  // takes an already-fetched resultSummary instead of re-running search.
  // Fails open: an AI outage must never break or block the report itself.
  async getTodayInsight(
    businessId: number,
    user: User,
    today: Record<string, any>,
    language: string,
  ): Promise<{ insight: string; recommendation: string | null }> {
    const business = await this.findById(businessId);
    if (business.user.id !== user.id) {
      throw new NotFoundException('Business not found');
    }
    let result: {
      insight: string;
      recommendation: string | null;
      confidence?: number;
    };
    try {
      result = await this.aiInsight.generate(today, language || 'en');
    } catch {
      return { insight: '', recommendation: null };
    }

    // AI audit trail (CLAUDE.md section 14) — every AI-generated
    // recommendation logs its own AI_EVENT, same accountability as any
    // other actor on the platform. Never blocks the response above:
    // record() already fails open (Phase 1), and this runs after result
    // is already computed, so a logging failure here can't lose the
    // insight the user is waiting on.
    const profile = await this.commerceProfiles
      .findForUserByType(user.id, CommerceProfileType.BUSINESS)
      .catch(() => null);
    if (profile) {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const sourceEventIds = await this.activityEvents
        .idsSince(
          profile.id,
          ['ORDER_CREATED', 'INVOICE_PAID', 'PROFILE_FOLLOWED', 'REVIEW_CREATED'],
          startOfToday,
        )
        .catch(() => []);
      this.activityEvents.record({
        eventType: 'AI_RECOMMENDATION_GENERATED',
        category: ActivityCategory.AI,
        businessId: profile.id,
        targetType: 'business_insight',
        targetId: businessId,
        visibility: 'system',
        metadata: {
          type: 'RECOMMENDATION',
          sourceEventIds,
          reason: result.insight,
          confidence: result.confidence ?? null,
          action: result.recommendation,
          status: 'PENDING',
        },
      });
    }

    return { insight: result.insight, recommendation: result.recommendation };
  }

  // ── Create a Business with no Seller (spec section 7: a manufacturer
  // that only wants a digital presence) ─────────────────────────────────
  async create(
    user: User,
    dto: {
      legalName: string;
      tradingName?: string;
      description?: string;
      category?: string;
      address?: string;
      phone?: string;
      email?: string;
      regionId?: number;
      region?: string;
      districtId?: number;
      district?: string;
      wardId?: number;
      ward?: string;
      responsiblePersonName?: string;
      tinNumber?: string;
      registrationNumber?: string;
      businessLicenseNumber?: string;
    },
  ): Promise<Business> {
    const existing = await this.findMine(user.id);
    if (existing) throw new ConflictException('You already have a Business');

    const business = this.businessRepo.create({
      ...dto,
      user,
      status: BusinessStatus.ACTIVE,
    });
    const saved = await this.businessRepo.save(business);

    // Public presence alongside the operational record, same pattern
    // SellerService.apply() and CommerceProfilesBackfillService already
    // use for every other role type. Non-fatal.
    let profileId: number | null = null;
    try {
      const profile = await this.commerceProfiles.createProfile({
        ownerId: user.id,
        type: CommerceProfileType.BUSINESS,
        displayName: saved.tradingName || saved.legalName,
        usernameSeed: saved.tradingName || saved.legalName,
        photoUrl: user.logo || saved.logo,
        bio: saved.description,
        location: saved.address,
        status: CommerceProfileStatus.ACTIVE,
        businessId: saved.id,
      });
      profileId = profile.id;
    } catch {}

    // createProfile() above already emits its own PROFILE_CREATED event;
    // this is the more specific BUSINESS_CREATED event, distinct because
    // Business (spec section 7: a Business with no Seller) is its own
    // identity concept, not just "a profile got created".
    this.activityEvents.record({
      eventType: 'BUSINESS_CREATED',
      category: ActivityCategory.BUSINESS,
      actorId: user.id,
      actorType: 'user',
      businessId: profileId,
      targetType: 'business',
      targetId: saved.id,
    });

    return saved;
  }

  async update(
    businessId: number,
    user: User,
    dto: Partial<{
      legalName: string;
      tradingName: string;
      description: string;
      category: string;
      logo: string;
      coverImage: string;
      address: string;
      phone: string;
      email: string;
    }>,
  ): Promise<Business> {
    const business = await this.findById(businessId);
    if (business.user.id !== user.id) {
      throw new NotFoundException('Business not found');
    }
    await this.businessRepo.update(businessId, dto);
    const saved = await this.findById(businessId);

    // Keep the public CommerceProfile in sync -- same fields it was
    // seeded from at create() time. Best-effort: never blocks the save.
    const commerceProfile = await this.commerceProfiles.findForUserByType(
      user.id,
      CommerceProfileType.BUSINESS,
    );
    if (commerceProfile) {
      await this.commerceProfiles
        .updatePublicFields(commerceProfile.id, {
          displayName: saved.tradingName || saved.legalName,
          photoUrl: saved.logo,
          coverImage: saved.coverImage,
          bio: saved.description,
        })
        .catch(() => {});
    }

    return saved;
  }

  // ── Activate Seller on an existing Business (spec section 9: "a
  // business can activate Seller later") ─────────────────────────────────
  async activateSeller(businessId: number, user: User): Promise<SellerProfile> {
    const business = await this.findById(businessId);
    if (business.user.id !== user.id) {
      throw new NotFoundException('Business not found');
    }
    const existingSeller = await this.sellerProfileRepo.findOne({
      where: { user: { id: user.id } },
    });
    if (existingSeller) {
      throw new ConflictException('You already have a seller application');
    }

    const sellerProfile = this.sellerProfileRepo.create({
      user,
      businessId: business.id,
      businessName: business.tradingName || business.legalName,
      businessDescription: business.description,
      businessCategory: business.category,
      address: business.address,
      phone: business.phone,
      regionId: business.regionId,
      businessRegion: business.region,
      districtId: business.districtId,
      businessDistrict: business.district,
      wardId: business.wardId,
      businessCity: business.ward,
      registrationNumber: business.registrationNumber,
      tinNumber: business.tinNumber,
      businessLicenseNumber: business.businessLicenseNumber,
      sellerType: 'business',
      status: SellerStatus.PENDING,
    });
    return this.sellerProfileRepo.save(sellerProfile);
  }
}
