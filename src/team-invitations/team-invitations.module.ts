import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TeamInvitationsController } from './team-invitations.controller';
import { TeamInvitationsService } from './team-invitations.service';

@Module({
  imports: [NotificationsModule],
  controllers: [TeamInvitationsController],
  providers: [TeamInvitationsService],
  exports: [TeamInvitationsService],
})
export class TeamInvitationsModule {}
