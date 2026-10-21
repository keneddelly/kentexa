import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyBatchesService } from './daily-batches.service';
import { DailyBatchesController } from './daily-batches.controller';
import { DailyBatch } from './entities/daily-batch.entity';
import { BatchParcel } from './entities/batch-parcel.entity';
import { DeliveryZone } from './entities/delivery-zone.entity';
import { Order } from '../orders/entities/order.entity';
import { Product } from '../products/entities/products.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommunicationModule } from '../communication/communication.module';
import { PaymentCoreModule } from '../payments/payment-core.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DailyBatch,
      BatchParcel,
      DeliveryZone,
      Order,
      Product,
      SuperAgent, // needed by DeliveryZone#superAgent relation
    ]),
    NotificationsModule,
    CommunicationModule,
    PaymentCoreModule,
    WalletModule,
  ],
  controllers: [DailyBatchesController],
  providers: [DailyBatchesService],
  exports: [DailyBatchesService],
})
export class DailyBatchesModule {}
