/**
 * SellerModule
 * Place at: src/seller/seller.module.ts
 * (Replaces existing seller.module.ts on disk — adds BusinessTeamMember)
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SellerProfile } from './entities/seller-profile.entity';
import { SellerController } from './seller.controller';
import { SellerService } from './seller.service';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { Classified } from '../classifieds/entities/classified.entity';
import { Product } from '../products/entities/products.entity';
import { BusinessTeamMember } from '../business/entities/business-team-member.entity';
import { ProfileModule } from '../profile/profile.module';
import { BusinessModule } from '../business/business.module';
import { CommerceProfilesModule } from '../commerce-profiles/commerce-profiles.module';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SellerProfile,
      User,
      Order,
      Classified,
      Product,
      BusinessTeamMember, // ← added for team management
    ]),
    ProfileModule,
    BusinessModule,
    CommerceProfilesModule,
    IdentityModule,
  ],
  controllers: [SellerController],
  providers: [SellerService],
  exports: [SellerService],
})
export class SellerModule {}
