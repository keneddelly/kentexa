import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreService } from './store.service';
import { StoreController } from './store.controller';
import { User } from '../users/entities/user.entity';
import { Follow } from './follow.entity';
import { Review } from './review.entity';
import { Order } from '../orders/entities/order.entity';
import { Product } from '../products/entities/products.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Follow, Review, Order, Product])],
  providers: [StoreService],
  controllers: [StoreController],
  exports: [StoreService],
})
export class StoreModule {}