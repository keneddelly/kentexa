import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SmsModule } from '../sms/sms.module';
import { KentexaFeeController } from './kentexa-fee.controller';
import { KentexaFeeService } from './kentexa-fee.service';

@Module({
  imports: [NotificationsModule, SmsModule],
  controllers: [KentexaFeeController],
  providers: [KentexaFeeService],
  exports: [KentexaFeeService],
})
export class KentexaFeeModule {}
