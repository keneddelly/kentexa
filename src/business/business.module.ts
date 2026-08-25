import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessCustomer } from './entities/business-customer.entity';
import { Conversation } from './entities/conversation.entity';
import { ConversationMessage } from './entities/conversation-message.entity';
import { BusinessTeamMember } from './entities/business-team-member.entity';
import { Business } from './entities/business.entity';
import { Order } from '../orders/entities/order.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { CommerceProfile } from '../commerce-profiles/entities/commerce-profile.entity';
import { BusinessCustomerService } from './business-customer.service';
import { ConversationService } from './conversation.service';
import { SellerScopeService } from './seller-scope.service';
import { BusinessService } from './business.service';
import { BusinessBackfillService } from './business-backfill.service';
import { BusinessController } from './business.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommerceProfilesModule } from '../commerce-profiles/commerce-profiles.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BusinessCustomer,
      Conversation,
      ConversationMessage,
      BusinessTeamMember,
      Business,
      Order,
      SellerProfile,
      CommerceProfile,
    ]),
    NotificationsModule,
    CommerceProfilesModule,
  ],
  controllers: [BusinessController],
  providers: [
    BusinessCustomerService,
    ConversationService,
    SellerScopeService,
    BusinessService,
    BusinessBackfillService,
  ],
  exports: [BusinessCustomerService, ConversationService, SellerScopeService, BusinessService],
})
export class BusinessModule {}
