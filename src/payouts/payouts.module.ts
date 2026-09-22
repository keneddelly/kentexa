import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { Payout } from './entities/payout.entity';
import { Order } from '../orders/entities/order.entity';
import { PaymentCoreModule } from '../payments/payment-core.module';

@Module({
  imports: [TypeOrmModule.forFeature([Payout, Order]), PaymentCoreModule],
  controllers: [PayoutsController],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
