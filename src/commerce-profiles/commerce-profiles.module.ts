import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommerceProfile } from './entities/commerce-profile.entity';
import { CommerceProfileMember } from './entities/commerce-profile-member.entity';
import { CommerceProfileFollow } from './entities/commerce-profile-follow.entity';
import { User } from '../users/entities/user.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { TransportProvider } from '../transport/entities/transport-provider.entity';
import { Agent } from '../agents/entities/agent.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { Review } from '../store/review.entity';
import { ProductReview } from '../products/entities/product-review.entity';
import { CommerceProfilesService } from './commerce-profiles.service';
import { CommerceProfilesBackfillService } from './commerce-profiles-backfill.service';
import { CommerceProfileScopeService } from './commerce-profile-scope.service';
import { CommerceProfilesController } from './commerce-profiles.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CommerceProfile,
      CommerceProfileMember,
      CommerceProfileFollow,
      User,
      SellerProfile,
      TransportProvider,
      Agent,
      SuperAgent,
      Review,
      ProductReview,
    ]),
  ],
  controllers: [CommerceProfilesController],
  providers: [
    CommerceProfilesService,
    CommerceProfilesBackfillService,
    CommerceProfileScopeService,
  ],
  exports: [CommerceProfilesService, CommerceProfileScopeService],
})
export class CommerceProfilesModule {}
