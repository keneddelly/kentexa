import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SellingCapability } from './entities/selling-capability.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { SellingCapabilityService } from './selling-capability.service';
import { SellingCapabilityBackfillService } from './selling-capability-backfill.service';
import { SellingCapabilityController } from './selling-capability.controller';
import { CommerceProfilesModule } from '../commerce-profiles/commerce-profiles.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SellingCapability, SellerProfile]),
    CommerceProfilesModule,
  ],
  controllers: [SellingCapabilityController],
  providers: [SellingCapabilityService, SellingCapabilityBackfillService],
  exports: [SellingCapabilityService],
})
export class SellingCapabilityModule {}
