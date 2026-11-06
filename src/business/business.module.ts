import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BusinessCustomer } from './entities/business-customer.entity';
import { Conversation } from './entities/conversation.entity';
import { ConversationMessage } from './entities/conversation-message.entity';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { ConversationParticipantState } from './entities/conversation-participant-state.entity';
import { BusinessTeamMember } from './entities/business-team-member.entity';
import { Business } from './entities/business.entity';
import { OperationalWorkspace } from './entities/operational-workspace.entity';
import { BusinessMembership } from './entities/business-membership.entity';
import { WorkspaceAssignment } from './entities/workspace-assignment.entity';
import { BusinessCapability } from './entities/business-capability.entity';
import { BusinessCapabilityApplication } from './entities/business-capability-application.entity';
import { Order } from '../orders/entities/order.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { CommerceProfile } from '../commerce-profiles/entities/commerce-profile.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Product } from '../products/entities/products.entity';
import { Classified } from '../classifieds/entities/classified.entity';
import { ServiceAd } from '../services/entities/service-ad.entity';
import { BusinessCustomerService } from './business-customer.service';
import { ConversationService } from './conversation.service';
import { SellerScopeService } from './seller-scope.service';
import { BusinessService } from './business.service';
import { BusinessBackfillService } from './business-backfill.service';
import { BusinessCapabilityApplicationService } from './business-capability-application.service';
import { BusinessCapabilityLifecycleService } from './business-capability-lifecycle.service';
import { BusinessController } from './business.controller';
import { AdminBusinessController } from './admin-business.controller';
import { AdminBusinessCapabilityApplicationController } from './admin-business-capability-application.controller';
import { AdminBusinessCapabilityController } from './admin-business-capability.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommerceProfilesModule } from '../commerce-profiles/commerce-profiles.module';
import { ActivityModule } from '../activity/activity.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AiModule } from '../ai/ai.module';
import { IdentityModule } from '../identity/identity.module';
import { TzLocationModule } from '../tz-location/tz-location.module';
import { ConversationGateway } from './conversation.gateway';
import { ParticipantResolutionService } from './participant-resolution.service';
import { ConversationClassifierService } from './conversation-classifier.service';
import { InstagramBusinessConnection } from './entities/instagram-business-connection.entity';
import { InstagramBusinessContact } from './entities/instagram-business-contact.entity';
import { InstagramBusinessContactService } from './instagram-business-contact.service';
import { InstagramBusinessAccessService } from './instagram-business-access.service';
import { InstagramWebhookController } from './instagram-webhook.controller';
import { InstagramWebhookEvent } from './entities/instagram-webhook-event.entity';
import { InstagramWebhookIngestionService } from './instagram-webhook-ingestion.service';
import { InstagramTokenCryptoService } from './instagram-token-crypto.service';
import { InstagramBusinessConnectionService } from './instagram-business-connection.service';
import { InstagramBusinessConnectionsController } from './instagram-business-connections.controller';
import { InstagramOAuthState } from './entities/instagram-oauth-state.entity';
import { InstagramOAuthService } from './instagram-oauth.service';
import { InstagramOAuthController } from './instagram-oauth.controller';
import { InstagramOAuthCallbackController } from './instagram-oauth-callback.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BusinessCustomer,
      Conversation,
      ConversationMessage,
      ConversationParticipant,
      ConversationParticipantState,
      BusinessTeamMember,
      Business,
      OperationalWorkspace,
      BusinessMembership,
      WorkspaceAssignment,
      BusinessCapability,
      BusinessCapabilityApplication,
      InstagramBusinessConnection,
      InstagramBusinessContact,
      InstagramWebhookEvent,
      InstagramOAuthState,
      Order,
      SellerProfile,
      CommerceProfile,
      Invoice,
      Product,
      Classified,
      ServiceAd,
    ]),
    NotificationsModule,
    CommerceProfilesModule,
    ActivityModule,
    AnalyticsModule,
    AiModule,
    IdentityModule,
    TzLocationModule,
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
  controllers: [BusinessController, AdminBusinessController, AdminBusinessCapabilityApplicationController, AdminBusinessCapabilityController, InstagramWebhookController, InstagramBusinessConnectionsController, InstagramOAuthController, InstagramOAuthCallbackController],
  providers: [
    BusinessCustomerService,
    ConversationService,
    SellerScopeService,
    BusinessService,
    BusinessBackfillService,
    BusinessCapabilityApplicationService,
    BusinessCapabilityLifecycleService,
    ConversationGateway,
    ParticipantResolutionService,
    ConversationClassifierService,
    InstagramBusinessAccessService,
    InstagramWebhookIngestionService,
    InstagramBusinessContactService,
    InstagramTokenCryptoService,
    InstagramBusinessConnectionService,
    InstagramOAuthService,
  ],
  exports: [BusinessCustomerService, ConversationService, SellerScopeService, BusinessService, BusinessCapabilityApplicationService, ParticipantResolutionService, ConversationClassifierService, InstagramBusinessAccessService, InstagramBusinessContactService, InstagramTokenCryptoService, InstagramBusinessConnectionService],
})
export class BusinessModule {}
