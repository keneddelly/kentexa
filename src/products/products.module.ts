import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { AiListingService } from './ai-listing.service';
import { Product } from './entities/products.entity';
import { ProductReview } from './entities/product-review.entity';
import { FeedModule } from '../feed/feed.module';
import { AiModule } from '../ai/ai.module';
import { BusinessModule } from '../business/business.module';
import { CommerceProfilesModule } from '../commerce-profiles/commerce-profiles.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductReview]),
    FeedModule,
    AiModule,
    BusinessModule,
    CommerceProfilesModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService, AiListingService],
  exports: [ProductsService],
})
export class ProductsModule {}
