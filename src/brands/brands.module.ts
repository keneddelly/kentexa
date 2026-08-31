import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Brand } from './entities/brand.entity';
import { Distributor } from './entities/distributor.entity';
import { BrandDistributor } from './entities/brand-distributor.entity';
import { BusinessBrandAuthorization } from './entities/business-brand-authorization.entity';
import { BrandAuthorizationEvidence } from './entities/brand-authorization-evidence.entity';
import { BrandAuthorizationAuditLog } from './entities/brand-authorization-audit-log.entity';
import { CommerceProfile } from '../commerce-profiles/entities/commerce-profile.entity';
import { User } from '../users/entities/user.entity';
import { BrandsService } from './brands.service';
import { BrandsController } from './brands.controller';
import { DistributorsService } from './distributors.service';
import { DistributorsController } from './distributors.controller';
import { BrandAuthorizationsService } from './brand-authorizations.service';
import { BrandAuthorizationsController } from './brand-authorizations.controller';
import { BrandDashboardService } from './brand-dashboard.service';
import { CommerceProfilesModule } from '../commerce-profiles/commerce-profiles.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SmsModule } from '../sms/sms.module';
import { ActivityModule } from '../activity/activity.module';
// Repo-only — NOT importing ProductsModule/OrdersModule (both already
// import/reference this module or its entities the other direction; see
// OrdersModule's own identical repo-only Brand registration) — the
// dashboard only ever needs COUNT/SUM aggregates, never the services'
// business logic.
import { Product } from '../products/entities/products.entity';
import { Order } from '../orders/entities/order.entity';

// ── Kentexa Brand & Authorization Network — Phase A ─────────────────────────
//
// Core rule this module exists to enforce, everywhere:
//   "This business sells LG products" (a free-text/product-level claim)
//   is NOT the same fact as
//   "LG has authorized this business" (BusinessBrandAuthorization, verified,
//   scoped, time-bound, auditable).
// Never collapse these into a single boolean anywhere in the codebase.
//
// Business != Brand != Seller Authorization:
//   - Brand: Kentexa's own record of the brand's identity (this module).
//   - CommerceProfile/Business: the seller's own identity (commerce-profiles/,
//     business/ — untouched by this module).
//   - BusinessBrandAuthorization: the explicit, scoped, verifiable link
//     between the two, reviewed by Kentexa admin (or eventually a real
//     brand/distributor account).
//
// See the plan file this was built from for the full audit + design
// rationale (entities, lifecycle, deferred scope).
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Brand,
      Distributor,
      BrandDistributor,
      BusinessBrandAuthorization,
      BrandAuthorizationEvidence,
      BrandAuthorizationAuditLog,
      CommerceProfile,
      User,
      Product,
      Order,
    ]),
    CommerceProfilesModule,
    NotificationsModule,
    SmsModule,
    ActivityModule,
  ],
  controllers: [BrandsController, DistributorsController, BrandAuthorizationsController],
  providers: [BrandsService, DistributorsService, BrandAuthorizationsService, BrandDashboardService],
  exports: [BrandsService, BrandAuthorizationsService],
})
export class BrandsModule {}
