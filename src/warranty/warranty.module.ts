import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WarrantyService } from './warranty.service';
import { WarrantyController } from './warranty.controller';
import { WarrantyRegistration } from './entities/warranty-registration.entity';
import { WarrantyClaim } from './entities/warranty-claim.entity';
import { WarrantyClaimAuditLog } from './entities/warranty-claim-audit-log.entity';
// Repo-only — NOT importing OrdersModule/ProductsModule (both already
// reference/are referenced by brands.module.ts the other direction; see
// that module's own identical repo-only Product/Order registration) —
// this module only ever needs plain reads off these entities, never
// their services' business logic.
import { Order } from '../orders/entities/order.entity';
import { Product } from '../products/entities/products.entity';
import { BrandsModule } from '../brands/brands.module';
import { BusinessModule } from '../business/business.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WarrantyRegistration, WarrantyClaim, WarrantyClaimAuditLog, Order, Product]),
    BrandsModule,
    BusinessModule,
    NotificationsModule,
    ActivityModule,
  ],
  controllers: [WarrantyController],
  providers: [WarrantyService],
  exports: [WarrantyService],
})
export class WarrantyModule {}
