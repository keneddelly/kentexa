import { Module } from '@nestjs/common';
import { SmsModule } from '../sms/sms.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivityModule } from '../activity/activity.module';
import { DispatchRemindersService } from './dispatch-reminders.service';
import { DispatchRemindersController } from './dispatch-reminders.controller';

// Read-only on parcels; its own two tables come from migration 1791700000000.
@Module({
  imports: [SmsModule, NotificationsModule, ActivityModule],
  controllers: [DispatchRemindersController],
  providers: [DispatchRemindersService],
})
export class DispatchRemindersModule {}
