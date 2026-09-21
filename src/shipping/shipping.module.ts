import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../orders/entities/order.entity';
import { ShippingService } from './shipping.service';
import { ShippingController } from './shipping.controller';
import { DisputesModule } from '../disputes/disputes.module';
import { BusinessModule } from '../business/business.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [TypeOrmModule.forFeature([Order]), DisputesModule, BusinessModule, WalletModule],
  controllers: [ShippingController],
  providers: [ShippingService],
  exports: [ShippingService],
})
export class ShippingModule {}
