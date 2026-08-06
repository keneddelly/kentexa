import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BusinessCustomer } from './entities/business-customer.entity';
import { Conversation } from './entities/conversation.entity';
import { ConversationMessage } from './entities/conversation-message.entity';
import { BusinessTeamMember } from './entities/business-team-member.entity';
import { Order } from '../orders/entities/order.entity';
import { User } from '../users/entities/user.entity';
import { BusinessCustomerService } from './business-customer.service';
import { ConversationService } from './conversation.service';
import { ConversationGateway } from './conversation.gateway';
import { BusinessController } from './business.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BusinessCustomer,
      Conversation,
      ConversationMessage,
      BusinessTeamMember,
      Order,
      User,
    ]),
    NotificationsModule,
    forwardRef(() => WhatsappModule), // ConversationService relays outbound replies via WhatsappService
    // Own JwtModule registration (same secret resolution as auth.module.ts)
    // so the WebSocket gateway can verify tokens without depending on
    // AuthModule's exports.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error(
            'JWT_SECRET environment variable is required — refusing to start with a default secret',
          );
        }
        return { secret };
      },
    }),
  ],
  controllers: [BusinessController],
  providers: [BusinessCustomerService, ConversationService, ConversationGateway],
  exports: [BusinessCustomerService, ConversationService],
})
export class BusinessModule {}
