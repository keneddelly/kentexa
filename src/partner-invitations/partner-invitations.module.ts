import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PartnerInvitation } from './partner-invitation.entity';
import { PartnerInvitationsService } from './partner-invitations.service';
import { PartnerInvitationsController } from './partner-invitations.controller';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { Parcel } from '../super-agents/entities/parcel.entity';
import { TransportProvider } from '../transport/entities/transport-provider.entity';

// Deliberately no SmsModule: partner invitations never use KenteXa's SMS.
// No dependency on SuperAgentsModule or TransportModule (they import this one).
@Module({
  imports: [TypeOrmModule.forFeature([PartnerInvitation, SuperAgent, Parcel, TransportProvider])],
  controllers: [PartnerInvitationsController],
  providers: [PartnerInvitationsService],
  exports: [PartnerInvitationsService],
})
export class PartnerInvitationsModule {}
