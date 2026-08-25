import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityController } from './identity.controller';
import { VerificationService } from './verification.service';
import { IdentityProfile } from './entities/identity-profile.entity';
import { IdentityVerificationAudit } from './entities/identity-verification-audit.entity';
import { BusinessDocument } from './entities/business-document.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { ManualReviewProvider } from './providers/manual-review.provider';
import { IDENTITY_VERIFICATION_PROVIDER } from './identity.tokens';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      IdentityProfile,
      IdentityVerificationAudit,
      BusinessDocument,
      SellerProfile,
      SuperAgent,
    ]),
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
