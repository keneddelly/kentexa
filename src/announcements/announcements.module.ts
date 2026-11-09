import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementsController } from './announcements.controller';
import { Announcement } from './announcement.entity';
import { User } from '../users/entities/user.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { SmsModule } from '../sms/sms.module';
import { KentexaMessagesService } from './kentexa-messages.service';
import { AccountRole } from '../role-context/entities/account-role.entity';
import { Business } from '../business/entities/business.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Announcement, User, SellerProfile, SuperAgent, AccountRole, Business, Notification]),
    SmsModule,
    NotificationsModule,
  ],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService, KentexaMessagesService],
  exports: [AnnouncementsService, KentexaMessagesService],
})
export class AnnouncementsModule {}
