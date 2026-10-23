import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { SellerAgentPartnersService } from './seller-agent-partners.service';
import { SellerAgentPartnersController } from './seller-agent-partners.controller';

// Seller partner agents. No SmsModule: the invitation goes by the seller's own
// WhatsApp/SMS. Nothing imports this module, so it adds no import cycle.
@Module({
  imports: [BusinessModule],
  controllers: [SellerAgentPartnersController],
  providers: [SellerAgentPartnersService],
})
export class SellerAgentPartnersModule {}
