import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivityModule } from '../activity/activity.module';
import { FoodOrdersService } from './food-orders.service';
import { FoodOrdersController } from './food-orders.controller';

// Raw SQL on its own tables (food_menu_settings, food_menu_item, food_order), plus
// read-only joins to business, commerce_profile and seller_profile.
@Module({
  imports: [NotificationsModule, ActivityModule],
  controllers: [FoodOrdersController],
  providers: [FoodOrdersService],
  exports: [FoodOrdersService],
})
export class FoodOrdersModule {}
