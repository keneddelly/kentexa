import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityController } from './identity.controller';
import { VerificationService } from './verification.service';
import { IdentityProfile } from './entities/identity-profile.entity';
import { IdentityVerificationAudit } from './entities/identity-verification-audit.entity';
import { BusinessDocument } from './entities/business-document.entity';
import { Referral } from './entities/referral.entity';
import { ReferralReward } from './entities/referral-reward.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { ManualReviewProvider } from './providers/manual-review.provider';
import { IDENTITY_VERIFICATION_PROVIDER } from './identity.tokens';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      IdentityProfile,
      IdentityVerificationAudit,
      BusinessDocument,
      Referral,
      ReferralReward,
      SellerProfile,
      SuperAgent,
    ]),
    ActivityModule,
  ],
  controllers: [IdentityController],
  providers: [
    VerificationService,
    ManualReviewProvider,
    {
      // Swap this useClass for a real provider later — nothing else in
      // this module needs to change.
      provide: IDENTITY_VERIFICATION_PROVIDER,
      useClass: ManualReviewProvider,
    },
  ],
  exports: [VerificationService],
})
export class IdentityModule {}
