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
import { AgentsModule } from '../agents/agents.module';
import { SmsModule } from '../sms/sms.module';
import { BusinessModule } from '../business/business.module';
import { NotificationsModule } from '../notifications/notifications.module';

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
    ]),
    AgentsModule,
    SmsModule,
    BusinessModule,
    NotificationsModule,
  ],
  controllers: [SuperAgentsController],
  providers: [SuperAgentsService],
  exports: [SuperAgentsService],
})
export class SuperAgentsModule {}
