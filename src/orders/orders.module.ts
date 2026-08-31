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
import { ActivityModule } from '../activity/activity.module';
import { IdentityModule } from '../identity/identity.module';
import { ClassifiedInvoiceRequest } from '../classifieds/entities/classified-invoice-request.entity';
import { Classified } from '../classifieds/entities/classified.entity';
import { CodModule } from '../cod/cod.module';
import { Brand } from '../brands/entities/brand.entity';
import { CommunicationModule } from '../communication/communication.module';

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
      // Repo-only (not importing ClassifiedsModule, which already imports
      // OrdersModule — would be circular) — same pattern SuperAgentsModule
      // already uses for Order/Payment/Sale. Lets markClassifiedSoldIfLinked()
      // trace a completed order back to its originating classified listing.
      ClassifiedInvoiceRequest,
      Classified,
      // Repo-only for the brand-name snapshot at order creation — see
      // Order.brandNameSnapshot. Not importing BrandsModule since only the
      // repository is needed here (same pattern as ClassifiedInvoiceRequest/
      // Classified above).
      Brand,
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
    ActivityModule,
    IdentityModule,
    CodModule,
    CommunicationModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
