import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { AiListingService } from './ai-listing.service';
import { OfficialProductsService } from './official-products.service';
import { OfficialProductsController } from './official-products.controller';
import { Product } from './entities/products.entity';
import { ProductReview } from './entities/product-review.entity';
import { DigitalProductAsset } from './entities/digital-product-asset.entity';
import { ProductVariantGroup } from './entities/product-variant-group.entity';
import { OfficialProduct } from './entities/official-product.entity';
import { ProductSerial } from './entities/product-serial.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { Order } from '../orders/entities/order.entity';
// Repo-only — CommerceProfilesModule (imported below) already exports the
// services OfficialProductsService needs (CommerceProfileScopeService);
// this is just for reading the profile row itself (type/brandId check).
import { CommerceProfile } from '../commerce-profiles/entities/commerce-profile.entity';
import { SellerRankingService } from './seller-ranking.service';
import { FeedModule } from '../feed/feed.module';
import { AiModule } from '../ai/ai.module';
import { BusinessModule } from '../business/business.module';
import { CommerceProfilesModule } from '../commerce-profiles/commerce-profiles.module';
import { SearchModule } from '../search/search.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ActivityModule } from '../activity/activity.module';
import { IdentityModule } from '../identity/identity.module';
import { BrandsModule } from '../brands/brands.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductReview, DigitalProductAsset, SellerProfile, Order, ProductVariantGroup, OfficialProduct, ProductSerial, CommerceProfile]),
    FeedModule,
    AiModule,
    BusinessModule,
    CommerceProfilesModule,
    SearchModule,
    InventoryModule,
    ActivityModule,
    IdentityModule,
    BrandsModule,
  ],
  controllers: [ProductsController, OfficialProductsController],
  providers: [ProductsService, AiListingService, SellerRankingService, OfficialProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
