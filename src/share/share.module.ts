import { Module } from '@nestjs/common';
import { ShareController } from './share.controller';
import { ProductsModule } from '../products/products.module';
import { ClassifiedsModule } from '../classifieds/classifieds.module';
import { ServicesModule } from '../services/services.module';
import { SellerModule } from '../seller/seller.module';
import { TransportModule } from '../transport/transport.module';
import { CommerceProfilesModule } from '../commerce-profiles/commerce-profiles.module';

@Module({
  imports: [
    ProductsModule,
    ClassifiedsModule,
    ServicesModule,
    SellerModule,
    TransportModule,
    CommerceProfilesModule,
  ],
  controllers: [ShareController],
})
export class ShareModule {}
