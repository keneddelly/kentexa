import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SmsService } from './sms.service';
import { GrowthInviteService } from './growth-invite.service';
import { SmsInviteLog } from './entities/sms-invite-log.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SmsInviteLog, User])],
  providers: [SmsService, GrowthInviteService],
  // exported so AuthModule/PaymentsModule/NotificationsModule/SalesModule
  // can use SmsService, and any of those can now also use
  // GrowthInviteService to append a contextual "join Kentexa" nudge.
  exports: [SmsService, GrowthInviteService],
})
export class SmsModule {}
