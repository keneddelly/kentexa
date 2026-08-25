import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Business } from '../business/entities/business.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { Agent } from '../agents/entities/agent.entity';
import { TransportProvider } from '../transport/entities/transport-provider.entity';
import { Product } from '../products/entities/products.entity';
import { Classified } from '../classifieds/entities/classified.entity';
import { ServiceAd } from '../services/entities/service-ad.entity';
import { Order } from '../orders/entities/order.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Parcel } from '../super-agents/entities/parcel.entity';
import { CommerceProfile } from '../commerce-profiles/entities/commerce-profile.entity';
import { AdminIntelligenceService } from './admin-intelligence.service';
import { AdminIntelligenceController } from './admin-intelligence.controller';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Business,
      SellerProfile,
      Agent,
      TransportProvider,
      Product,
      Classified,
      ServiceAd,
      Order,
      Payment,
      Parcel,
      CommerceProfile,
    ]),
    ActivityModule,
  ],
  controllers: [AdminIntelligenceController],
  providers: [AdminIntelligenceService],
  exports: [AdminIntelligenceService],
})
export class AdminIntelligenceModule {}
