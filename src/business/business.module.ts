import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessCustomer } from './entities/business-customer.entity';
import { Conversation } from './entities/conversation.entity';
import { ConversationMessage } from './entities/conversation-message.entity';
import { BusinessTeamMember } from './entities/business-team-member.entity';
import { Order } from '../orders/entities/order.entity';
import { BusinessCustomerService } from './business-customer.service';
import { ConversationService } from './conversation.service';
import { SellerScopeService } from './seller-scope.service';
import { BusinessController } from './business.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BusinessCustomer,
      Conversation,
      ConversationMessage,
      BusinessTeamMember,
      Order,
    ]),
    NotificationsModule,
  ],
  controllers: [BusinessController],
  providers: [BusinessCustomerService, ConversationService, SellerScopeService],
  exports: [BusinessCustomerService, ConversationService, SellerScopeService],
})
export class BusinessModule {}
