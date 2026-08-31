import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommerceProfile, CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';
import { CommerceProfileScopeService } from '../commerce-profiles/commerce-profile-scope.service';
import { BusinessBrandAuthorization, BrandAuthorizationStatus } from './entities/business-brand-authorization.entity';
import { Product } from '../products/entities/products.entity';
import { Order } from '../orders/entities/order.entity';

// Read-only visibility for a brand's own identity — spec §19. Never a
// place financial/authorization state is decided; every number here is a
// plain aggregate over data that's already the real source of truth
// elsewhere (BusinessBrandAuthorization.status, Product.brandId,
// Order.brandId/totalAmount). No warrantyRegistrations field — see this
// module's own note in the approved plan: that metric doesn't exist yet
// anywhere in the system, so it's omitted rather than shown as a
// fabricated zero (CLAUDE.md: never invent activity).
@Injectable()
export class BrandDashboardService {
  constructor(
    @InjectRepository(CommerceProfile) private profileRepo: Repository<CommerceProfile>,
    @InjectRepository(BusinessBrandAuthorization) private authRepo: Repository<BusinessBrandAuthorization>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    private profileScope: CommerceProfileScopeService,
  ) {}

  async getDashboard(commerceProfileId: number, userId: number) {
    await this.profileScope.requireAuthorized(userId, commerceProfileId);

    const profile = await this.profileRepo.findOne({ where: { id: commerceProfileId } });
    if (!profile || profile.type !== CommerceProfileType.BRAND || !profile.brandId) {
      throw new NotFoundException('This profile is not a brand identity');
    }
    const brandId = profile.brandId;

    const authorizations = await this.authRepo.find({ where: { brand: { id: brandId } } });
    const byStatus: Record<string, number> = {};
    for (const status of Object.values(BrandAuthorizationStatus)) byStatus[status] = 0;
    for (const a of authorizations) byStatus[a.status] = (byStatus[a.status] || 0) + 1;

    // Cities — only from currently APPROVED authorizations with an
    // explicit geographicScope; unscoped (nationwide) authorizations
    // contribute nothing here rather than fabricating "everywhere".
    const cities = [
      ...new Set(
        authorizations
          .filter((a) => a.status === BrandAuthorizationStatus.APPROVED)
          .flatMap((a) => a.geographicScope || []),
      ),
    ].sort();

    const productsCount = await this.productRepo.count({ where: { brandId } });

    const orders = await this.orderRepo.find({ where: { brandId } });
    const ordersCount = orders.length;
    const ordersRevenue = orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);

    return {
      brandId,
      authorizedBusinesses: {
        total: authorizations.length,
        approved: byStatus[BrandAuthorizationStatus.APPROVED] || 0,
        pending: byStatus[BrandAuthorizationStatus.PENDING] || 0,
        suspended: byStatus[BrandAuthorizationStatus.SUSPENDED] || 0,
        rejected: byStatus[BrandAuthorizationStatus.REJECTED] || 0,
        expired: byStatus[BrandAuthorizationStatus.EXPIRED] || 0,
        revoked: byStatus[BrandAuthorizationStatus.REVOKED] || 0,
      },
      cities,
      products: productsCount,
      orders: { count: ordersCount, revenue: ordersRevenue },
    };
  }
}
