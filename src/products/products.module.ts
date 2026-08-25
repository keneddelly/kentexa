import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { AiListingService } from './ai-listing.service';
import { Product } from './entities/products.entity';
import { ProductReview } from './entities/product-review.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { Order } from '../orders/entities/order.entity';
import { SellerRankingService } from './seller-ranking.service';
import { FeedModule } from '../feed/feed.module';
import { AiModule } from '../ai/ai.module';
import { BusinessModule } from '../business/business.module';
import { CommerceProfilesModule } from '../commerce-profiles/commerce-profiles.module';
import { SearchModule } from '../search/search.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductReview, SellerProfile, Order]),
    FeedModule,
    AiModule,
    BusinessModule,
    CommerceProfilesModule,
    SearchModule,
    InventoryModule,
    ActivityModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService, AiListingService, SellerRankingService],
  exports: [ProductsService],
})
export class ProductsModule {}
