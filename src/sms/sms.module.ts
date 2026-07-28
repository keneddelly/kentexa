import { Module } from '@nestjs/common';
import { SmsService } from './sms.service';

@Module({
  providers: [SmsService],
  exports: [SmsService], // ← exported so AuthModule and PaymentsModule can use it
})
export class SmsModule {}
