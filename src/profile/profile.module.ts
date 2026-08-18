import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfileService } from './profile.service';
import { User } from '../users/entities/user.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { Agent } from '../agents/entities/agent.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { TransportProvider } from '../transport/entities/transport-provider.entity';
import { ServiceProvider } from '../service-providers/entities/service-provider.entity';
import { Review } from '../store/review.entity';
import { Product } from '../products/entities/products.entity';
import { CommerceProfilesModule } from '../commerce-profiles/commerce-profiles.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      SellerProfile,
      Agent,
      SuperAgent,
      TransportProvider,
      ServiceProvider,
      Review,
      Product,
    ]),
    CommerceProfilesModule,
  ],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
