import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { Agent } from '../agents/entities/agent.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { TransportProvider } from '../transport/entities/transport-provider.entity';
import {
  ServiceProvider,
  ServiceProviderStatus,
} from '../service-providers/entities/service-provider.entity';
import { Review } from '../store/review.entity';
import { Product } from '../products/entities/products.entity';
import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';
import { CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';

export interface RoleEntities {
  sellerProfile: SellerProfile | null;
  agent: Agent | null;
  superAgent: SuperAgent | null;
  transportProvider: TransportProvider | null;
  serviceProvider: ServiceProvider | null;
}

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(SellerProfile)
    private sellerProfileRepo: Repository<SellerProfile>,
    @InjectRepository(Agent) private agentRepo: Repository<Agent>,
    @InjectRepository(SuperAgent)
    private superAgentRepo: Repository<SuperAgent>,
    @InjectRepository(TransportProvider)
    private transportProviderRepo: Repository<TransportProvider>,
    @InjectRepository(ServiceProvider)
    private serviceProviderRepo: Repository<ServiceProvider>,
    @InjectRepository(Review) private reviewRepo: Repository<Review>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    private commerceProfiles: CommerceProfilesService,
  ) {}

  // ── Cheap: which role-entities does this user hold ───────────────────────
  // Used by the self-only /auth/profile hot path — no products/reviews.
  async getRoleEntities(userId: number): Promise<RoleEntities> {
    const [sellerProfile, agent, superAgent, transportProvider, serviceProvider] =
      await Promise.all([
        this.sellerProfileRepo
          .findOne({ where: { user: { id: userId } } })
          .catch(() => null),
        this.agentRepo
          .findOne({ where: { user: { id: userId } } })
          .catch(() => null),
        this.superAgentRepo
          .findOne({ where: { user: { id: userId } } })
          .catch(() => null),
        this.transportProviderRepo
          .findOne({ where: { user: { id: userId } } })
          .catch(() => null),
        // Approved-only, matching how SellerProfile is already surfaced
        // publicly elsewhere — avoids leaking a pending application.
        this.serviceProviderRepo
          .findOne({
            where: {
              user: { id: userId },
              status: ServiceProviderStatus.APPROVED,
            },
          })
          .catch(() => null),
      ]);
    return { sellerProfile, agent, superAgent, transportProvider, serviceProvider };
  }

  // ── Full public profile: user + role entities + products/reviews/follow ──
  async buildPublicProfile(userId: number, viewerId?: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return null;

    const [roleEntities, isFollowing, businessProfile] = await Promise.all([
      this.getRoleEntities(userId),
      this.commerceProfiles.isFollowingSeller(viewerId, userId).catch(() => false),
      this.commerceProfiles
        .findForUserByType(userId, CommerceProfileType.BUSINESS)
        .catch(() => null),
    ]);

    // Same scoping as products below — a review left for a Personal-profile
    // sale must not inflate the Business storefront's review list, even
    // though Review.commerceProfileId already correctly rolls into
    // CommerceProfile.reviewsCount/rating (commerce-profiles.service.ts's
    // recordReview()); this was the one place still listing them by raw
    // seller id regardless (profile-architecture-audit-2026-08).
    const reviews = businessProfile
      ? await this.reviewRepo
          .createQueryBuilder('r')
          .leftJoinAndSelect('r.buyer', 'buyer')
          .where(
            '(r."commerceProfileId" = :commerceProfileId OR (r."commerceProfileId" IS NULL AND r."sellerId" = :userId))',
            { commerceProfileId: businessProfile.id, userId },
          )
          .orderBy('r.createdAt', 'DESC')
          .take(20)
          .getMany()
      : await this.reviewRepo.find({
          where: { seller: { id: userId } },
          relations: { buyer: true },
          order: { createdAt: 'DESC' },
          take: 20,
        });

    // This storefront is unambiguously the account's BUSINESS identity
    // (matches StoreService.toggleFollow's same always-resolve-to-BUSINESS
    // behavior) — so products are scoped to that specific CommerceProfile,
    // not every product the raw account has ever listed. Without this, a
    // product posted under a Personal profile would still show up on the
    // Business storefront (profile-architecture-audit-2026-08). Legacy
    // products (posted before commerceProfileId existed) keep resolving
    // here via the NULL fallback, same rule as findOne()/findByCommerceProfile().
    const products = businessProfile
      ? await this.productRepo
          .createQueryBuilder('p')
          .where(
            '(p."commerceProfileId" = :commerceProfileId OR (p."commerceProfileId" IS NULL AND p."sellerId" = :userId))',
            { commerceProfileId: businessProfile.id, userId },
          )
          .orderBy('p.createdAt', 'DESC')
          .getMany()
      : await this.productRepo.find({
          where: { seller: { id: userId } },
          order: { createdAt: 'DESC' },
        });

    const { password, otp, otpExpiry, otpAttempts, ...safeUser } =
      user as any;

    // Combined so the count doesn't appear frozen the moment new follows
    // start being redirected onto the profile-scoped system (see
    // StoreService.toggleFollow()) — pre-existing legacy followers still
    // count via User.followersCount, new ones via the business profile.
    (safeUser as any).followersCount =
      (user.followersCount || 0) + (businessProfile?.followersCount || 0);

    return {
      user: safeUser,
      products: this.withComputedBadges(products),
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        verified: r.verified,
        date: r.createdAt,
        buyerName: r.buyer?.name || 'Anonymous',
      })),
      isFollowing,
      roleEntities,
    };
  }

  // isBestSeller/isNewArrival aren't stored columns — both are fully
  // derivable from data the product already tracks (salesCount, createdAt),
  // so computing them here at read time means they can never drift stale
  // the way an admin-set flag could. isFeatured/isRecommended are the only
  // badges that are actually stored, since those are curatorial calls with
  // no underlying signal to derive them from.
  private withComputedBadges(products: Product[]) {
    const NEW_ARRIVAL_WINDOW_DAYS = 21;
    const BEST_SELLER_COUNT = 3;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - NEW_ARRIVAL_WINDOW_DAYS);

    const bestSellerIds = new Set(
      [...products]
        .filter((p) => p.salesCount > 0)
        .sort((a, b) => b.salesCount - a.salesCount)
        .slice(0, BEST_SELLER_COUNT)
        .map((p) => p.id),
    );

    return products.map((p) => ({
      ...p,
      isBestSeller: bestSellerIds.has(p.id),
      isNewArrival: new Date(p.createdAt) >= cutoff,
    }));
  }
}
