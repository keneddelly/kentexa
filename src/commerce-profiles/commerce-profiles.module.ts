import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommerceProfile } from './entities/commerce-profile.entity';
import { CommerceProfileMember } from './entities/commerce-profile-member.entity';
import { User } from '../users/entities/user.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { TransportProvider } from '../transport/entities/transport-provider.entity';
import { Agent } from '../agents/entities/agent.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { CommerceProfilesService } from './commerce-profiles.service';
import { CommerceProfilesBackfillService } from './commerce-profiles-backfill.service';
import { CommerceProfilesController } from './commerce-profiles.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CommerceProfile,
      CommerceProfileMember,
      User,
      SellerProfile,
      TransportProvider,
      Agent,
      SuperAgent,
    ]),
  ],
  controllers: [CommerceProfilesController],
  providers: [CommerceProfilesService, CommerceProfilesBackfillService],
  exports: [CommerceProfilesService],
})
export class CommerceProfilesModule {}
