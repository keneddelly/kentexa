import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessCustomer }      from './entities/business-customer.entity';
import { Conversation }          from './entities/conversation.entity';
import { ConversationMessage }   from './entities/conversation-message.entity';
import { BusinessTeamMember }    from './entities/business-team-member.entity';
import { Order }                 from '../orders/entities/order.entity';
import { BusinessCustomerService } from './business-customer.service';
import { ConversationService }     from './conversation.service';
import { BusinessController }      from './business.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BusinessCustomer,
      Conversation,
      ConversationMessage,
      BusinessTeamMember,
      Order,
    ]),
  ],
  controllers: [BusinessController],
  providers:   [BusinessCustomerService, ConversationService],
  exports:     [BusinessCustomerService, ConversationService],
})
export class BusinessModule {}