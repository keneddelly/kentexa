import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { KentexaFeeController } from './kentexa-fee.controller';
import { KentexaFeeService } from './kentexa-fee.service';

@Module({
  imports: [NotificationsModule],
  controllers: [KentexaFeeController],
  providers: [KentexaFeeService],
  exports: [KentexaFeeService],
})
export class KentexaFeeModule {}
