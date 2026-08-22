import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { Order } from './entities/order.entity';
import { Payout } from '../payouts/entities/payout.entity';
import { Parcel, ParcelTracking } from '../super-agents/entities/parcel.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { Agent } from '../agents/entities/agent.entity';
import { AgentTransaction } from '../agents/entities/agent-transaction.entity';
import { ProductsModule } from '../products/products.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ParcelCollectionsModule } from '../parcel-collections/parcel-collections.module';
import { BusinessModule } from '../business/business.module';
import { ReputationModule } from '../reputation/reputation.module';
import { User } from '../users/entities/user.entity';
import { SmsModule } from '../sms/sms.module';
import { Review } from '../store/review.entity';
import { WalletModule } from '../wallet/wallet.module';
import { CommerceProfilesModule } from '../commerce-profiles/commerce-profiles.module';
import { TransportAssignment } from '../transport/entities/transport-assignment.entity';
import { TransportProvider } from '../transport/entities/transport-provider.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      Payout,
      Parcel,
      ParcelTracking,
      SuperAgent,
      Agent,
      AgentTransaction,
      User,
      Review,
      TransportAssignment,
      TransportProvider,
    ]),
    ProductsModule,
    InvoicesModule,
    NotificationsModule,
    ParcelCollectionsModule, // ← Fix #1: enables collection request on order creation
    SmsModule,
    BusinessModule,
    ReputationModule,
    WalletModule,
    CommerceProfilesModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
