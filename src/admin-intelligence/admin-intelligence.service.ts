import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, In } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Business } from '../business/entities/business.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { Agent } from '../agents/entities/agent.entity';
import { TransportProvider } from '../transport/entities/transport-provider.entity';
import { Product } from '../products/entities/products.entity';
import { Classified } from '../classifieds/entities/classified.entity';
import { ServiceAd } from '../services/entities/service-ad.entity';
import { Order } from '../orders/entities/order.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { Parcel } from '../super-agents/entities/parcel.entity';
import { CommerceProfile } from '../commerce-profiles/entities/commerce-profile.entity';
import { ActivityEventService } from '../activity/activity-event.service';

// Layer 2 (CLAUDE.md's Internal AI Intelligence architecture) for
// administrators — deterministic counts and aggregations, no AI reasoning.
// "Platform activity" counts read straight from the real entity tables
// (same "current/historical state stays deterministic" rule
// BusinessService.getTodayIntelligence() already established) since they
// need to cover all-time history, not just what the ActivityEvent bus has
// collected since Phase 1. "Network intelligence" is where the event bus
// genuinely earns its keep — "fast-growing businesses" is a query that
// structurally could not exist before it.
@Injectable()
export class AdminIntelligenceService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Business) private businessRepo: Repository<Business>,
    @InjectRepository(SellerProfile)
    private sellerProfileRepo: Repository<SellerProfile>,
    @InjectRepository(Agent) private agentRepo: Repository<Agent>,
    @InjectRepository(TransportProvider)
    private transportProviderRepo: Repository<TransportProvider>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(Classified) private classifiedRepo: Repository<Classified>,
    @InjectRepository(ServiceAd) private serviceAdRepo: Repository<ServiceAd>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(Payment) private paymentRepo: Repository<Payment>,
    @InjectRepository(Parcel) private parcelRepo: Repository<Parcel>,
    @InjectRepository(CommerceProfile)
    private commerceProfileRepo: Repository<CommerceProfile>,
    private activityEvents: ActivityEventService,
  ) {}

  async getPlatformIntelligence(days = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceFilter = { createdAt: MoreThanOrEqual(since) };

    const [
      newUsers,
      newBusinesses,
      newSellers,
      newAgents,
      newTransporters,
      newProducts,
      newClassifieds,
      newServiceAds,
      orders,
      payments,
      shipments,
    ] = await Promise.all([
      this.userRepo.count({ where: sinceFilter }),
      this.businessRepo.count({ where: sinceFilter }),
      this.sellerProfileRepo.count({ where: sinceFilter }),
      this.agentRepo.count({ where: sinceFilter }),
      this.transportProviderRepo.count({ where: sinceFilter }),
      this.productRepo.count({ where: sinceFilter }),
      this.classifiedRepo.count({ where: sinceFilter }),
      this.serviceAdRepo.count({ where: sinceFilter }),
      this.orderRepo.count({ where: sinceFilter }),
      this.paymentRepo.count({
        where: { status: PaymentStatus.SUCCESS, ...sinceFilter },
      }),
      this.parcelRepo.count({ where: sinceFilter }),
    ]);

    const [popularCategories, popularLocations, fastGrowingBusinesses] =
      await Promise.all([
        this.getPopularCategories(since),
        this.getPopularLocations(since),
        this.getFastGrowingBusinesses(since),
      ]);

    return {
      periodDays: days,
      platformActivity: {
        newUsers,
        newBusinesses,
        newSellers,
        newAgents,
        newTransporters,
        newListings: newProducts + newClassifieds + newServiceAds,
        orders,
        payments,
        shipments,
      },
      networkIntelligence: {
        popularCategories,
        popularLocations,
        fastGrowingBusinesses,
      },
    };
  }

  private async getPopularCategories(since: Date) {
    const [productCats, classifiedCats] = await Promise.all([
      this.productRepo
        .createQueryBuilder('p')
        .select('p.category', 'category')
        .addSelect('COUNT(*)', 'count')
        .where('p.createdAt >= :since', { since })
        .andWhere('p.category IS NOT NULL')
        .groupBy('p.category')
        .getRawMany(),
      this.classifiedRepo
        .createQueryBuilder('c')
        .select('c.category', 'category')
        .addSelect('COUNT(*)', 'count')
        .where('c.createdAt >= :since', { since })
        .andWhere('c.category IS NOT NULL')
        .groupBy('c.category')
        .getRawMany(),
    ]);

    const merged = new Map<string, number>();
    for (const row of [...productCats, ...classifiedCats]) {
      merged.set(row.category, (merged.get(row.category) || 0) + Number(row.count));
    }
    return [...merged.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  private async getPopularLocations(since: Date) {
    const rows = await this.classifiedRepo
      .createQueryBuilder('c')
      .select('c.location', 'location')
      .addSelect('COUNT(*)', 'count')
      .where('c.createdAt >= :since', { since })
      .andWhere('c.location IS NOT NULL')
      .groupBy('c.location')
      .orderBy('count', 'DESC')
      .limit(5)
      .getRawMany();
    return rows.map((r) => ({ location: r.location, count: Number(r.count) }));
  }

  private async getFastGrowingBusinesses(since: Date) {
    const rows = await this.activityEvents.topBusinessesSince(since, 5);
    if (!rows.length) return [];
    const profileIds = rows.map((r) => r.businessId);
    const profiles = await this.commerceProfileRepo.find({
      where: { id: In(profileIds) },
    });
    const profileById = new Map(profiles.map((p) => [p.id, p]));
    return rows.map((r) => ({
      businessId: r.businessId,
      displayName: profileById.get(r.businessId)?.displayName || null,
      username: profileById.get(r.businessId)?.username || null,
      activityCount: r.count,
    }));
  }
}
