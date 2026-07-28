import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParcelCollectionsService } from './parcel-collections.service';
import { ParcelCollectionsController } from './parcel-collections.controller';
import { ParcelCollection } from './entities/parcel-collection.entity';
import { Order } from '../orders/entities/order.entity';
import { Parcel, ParcelTracking } from '../super-agents/entities/parcel.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { Agent } from '../agents/entities/agent.entity';
import { User } from '../users/entities/user.entity';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ParcelCollection,
      Order,
      Parcel,
      ParcelTracking,
      SuperAgent, // Parcel needs ParcelTracking + SuperAgent
      Agent,
      User, // ParcelCollection#seller and #agent need User
    ]),
    SmsModule,
  ],
  controllers: [ParcelCollectionsController],
  providers: [ParcelCollectionsService],
  exports: [ParcelCollectionsService],
})
export class ParcelCollectionsModule {}
