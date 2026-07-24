import { Module }              from '@nestjs/common';
import { TypeOrmModule }       from '@nestjs/typeorm';
import { NotificationsService }       from './notifications.service';
import { InAppNotificationService }   from './in-app-notification.service';
import { PushService }                from './push.service';
import { NotificationController }     from './notification.controller';
import { Notification }               from './entities/notification.entity';
import { PushSubscription }           from './entities/push-subscription.entity';
import { MailModule } from '../mail/mail.module';
import { SmsModule }  from '../sms/sms.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, PushSubscription]),
    MailModule,
    SmsModule,
  ],
  controllers: [NotificationController],
  providers:   [NotificationsService, InAppNotificationService, PushService],
  exports:     [NotificationsService, InAppNotificationService, PushService],
})
export class NotificationsModule {}