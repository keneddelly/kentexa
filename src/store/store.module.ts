import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreService } from './store.service';
import { StoreController } from './store.controller';
import { User } from '../users/entities/user.entity';
import { Follow } from './follow.entity';
import { Review } from './review.entity';
import { Order } from '../orders/entities/order.entity';
import { Product } from '../products/entities/products.entity';
import { ProfileModule } from '../profile/profile.module';
import { BusinessModule } from '../business/business.module';
import { CommerceProfilesModule } from '../commerce-profiles/commerce-profiles.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Follow, Review, Order, Product]),
    ProfileModule,
    BusinessModule,
    CommerceProfilesModule,
    NotificationsModule,
  ],
  providers: [StoreService],
  controllers: [StoreController],
  exports: [StoreService],
})
export class StoreModule {}
