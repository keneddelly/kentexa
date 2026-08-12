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
import { Follow } from '../store/follow.entity';
import { Review } from '../store/review.entity';
import { Product } from '../products/entities/products.entity';

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
    @InjectRepository(Follow) private followRepo: Repository<Follow>,
    @InjectRepository(Review) private reviewRepo: Repository<Review>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
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

    const [roleEntities, products, reviews] = await Promise.all([
      this.getRoleEntities(userId),
      this.productRepo.find({
        where: { seller: { id: userId } },
        order: { createdAt: 'DESC' },
      }),
      this.reviewRepo.find({
        where: { seller: { id: userId } },
        relations: { buyer: true },
        order: { createdAt: 'DESC' },
        take: 20,
      }),
    ]);

    let isFollowing = false;
    if (viewerId) {
      const f = await this.followRepo.findOne({
        where: { follower: { id: viewerId }, seller: { id: userId } },
      });
      isFollowing = !!f;
    }

    const { password, otp, otpExpiry, otpAttempts, ...safeUser } =
      user as any;

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
