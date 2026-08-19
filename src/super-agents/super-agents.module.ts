import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuperAgentsService } from './super-agents.service';
import { SuperAgentsController } from './super-agents.controller';
import { SuperAgent } from './entities/super-agent.entity';
import { Parcel, ParcelTracking } from './entities/parcel.entity';
import { ShippingRate } from './entities/shipping-rate.entity';
import { BulkShipment } from './entities/bulk-shipment.entity';
import { IntercityRoute } from './entities/intercity-route.entity';
import { Order } from '../orders/entities/order.entity';
import { BatchParcel } from '../daily-batches/entities/batch-parcel.entity';
import { DailyBatch } from '../daily-batches/entities/daily-batch.entity';
import { DeliveryZone } from '../daily-batches/entities/delivery-zone.entity';
import { Agent } from '../agents/entities/agent.entity';
import { AgentTransaction } from '../agents/entities/agent-transaction.entity';
import { User } from '../users/entities/user.entity';
import { AgentsModule } from '../agents/agents.module';
import { SmsModule } from '../sms/sms.module';
import { BusinessModule } from '../business/business.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommerceProfilesModule } from '../commerce-profiles/commerce-profiles.module';
import { TransportAssignment } from '../transport/entities/transport-assignment.entity';
import { InvoicesModule } from '../invoices/invoices.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { Payment } from '../payments/entities/payment.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SuperAgent,
      Parcel,
      ParcelTracking,
      ShippingRate,
      BulkShipment,
      Order,
      Agent,
      AgentTransaction,
      BatchParcel,
      DailyBatch,
      DeliveryZone, // all three needed — BatchParcel has relations to both
      IntercityRoute,
      User,
      // Repo-only (not importing TransportModule) — lets dispatchParcel()
      // optionally link a real, verified TransportAssignment instead of
      // only free-text company fields, without a module-level dependency.
      TransportAssignment,
      Payment,
      SellerProfile,
    ]),
    AgentsModule,
    SmsModule,
    BusinessModule,
    NotificationsModule,
    CommerceProfilesModule,
    InvoicesModule,
    AuditLogModule,
  ],
  controllers: [SuperAgentsController],
  providers: [SuperAgentsService],
  exports: [SuperAgentsService],
})
export class SuperAgentsModule {}
