import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BusinessCustomer } from './entities/business-customer.entity';
import { Conversation } from './entities/conversation.entity';
import { ConversationMessage } from './entities/conversation-message.entity';
import { BusinessTeamMember } from './entities/business-team-member.entity';
import { Business } from './entities/business.entity';
import { Order } from '../orders/entities/order.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { CommerceProfile } from '../commerce-profiles/entities/commerce-profile.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Product } from '../products/entities/products.entity';
import { BusinessCustomerService } from './business-customer.service';
import { ConversationService } from './conversation.service';
import { SellerScopeService } from './seller-scope.service';
import { BusinessService } from './business.service';
import { BusinessBackfillService } from './business-backfill.service';
import { BusinessController } from './business.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommerceProfilesModule } from '../commerce-profiles/commerce-profiles.module';
import { ActivityModule } from '../activity/activity.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AiModule } from '../ai/ai.module';
import { ConversationGateway } from './conversation.gateway';

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
      Invoice,
      Product,
    ]),
    NotificationsModule,
    CommerceProfilesModule,
    ActivityModule,
    AnalyticsModule,
    AiModule,
    // Registered here too (not just AuthModule, which doesn't export its
    // own JwtModule) so ConversationGateway can verify a socket handshake's
    // JWT the exact same way JwtAuthGuard verifies a REST request's —
    // same JWT_SECRET, same fail-loudly-if-missing behavior.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error(
            'JWT_SECRET is not set. Refusing to start with a fallback signing secret.',
          );
        }
        return { secret, signOptions: { expiresIn: '7d' } };
      },
    }),
  ],
  controllers: [BusinessController],
  providers: [
    BusinessCustomerService,
    ConversationService,
    SellerScopeService,
    BusinessService,
    BusinessBackfillService,
    ConversationGateway,
  ],
  exports: [BusinessCustomerService, ConversationService, SellerScopeService, BusinessService],
})
export class BusinessModule {}
