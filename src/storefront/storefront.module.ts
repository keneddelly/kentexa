import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { StorefrontController } from './storefront.controller';
import { StorefrontService } from './storefront.service';

// Duka page template (owner 2026-11-18). Raw SQL on commerce_profile, product and store_collection.
@Module({
  imports: [ActivityModule],
  controllers: [StorefrontController],
  providers: [StorefrontService],
})
export class StorefrontModule {}
