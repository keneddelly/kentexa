import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';
import { AgentsPublicController } from './agents-public.controller';
import { AgentCodRemittanceService } from './agent-cod-remittance.service';
import { AgentOnlineExpiryService } from './agent-online-expiry.service';
import { AgentPickupReofferService } from './agent-pickup-reoffer.service';
import { CommunicationModule } from '../communication/communication.module';
import { Agent } from './entities/agent.entity';
import { AgentTransaction } from './entities/agent-transaction.entity';
import { User } from '../users/entities/user.entity';
import { SmsModule } from '../sms/sms.module';
import { CommerceProfilesModule } from '../commerce-profiles/commerce-profiles.module';
import { ActivityModule } from '../activity/activity.module';
import { IdentityModule } from '../identity/identity.module';
import { LocationIntelligenceModule } from '../location-intelligence/location-intelligence.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Agent, User, AgentTransaction]),
    SmsModule,
    CommerceProfilesModule,
    ActivityModule,
    // Agent sign-up: the account's identity record and the place list.
    IdentityModule,
    LocationIntelligenceModule,
    // D5: the in-app job alert when an agent goes online.
    CommunicationModule,
  ],
  controllers: [AgentsPublicController, AgentsController],
  providers: [AgentsService, AgentCodRemittanceService, AgentOnlineExpiryService, AgentPickupReofferService],
  exports: [AgentsService],
})
export class AgentsModule {}
