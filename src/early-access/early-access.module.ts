import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { EarlyAccessRegistration } from './entities/early-access-registration.entity';
import { EarlyAccessOtp } from './entities/early-access-otp.entity';
import { EarlyAccessController } from './early-access.controller';
import { EarlyAccessService } from './early-access.service';
import { EarlyAccessUploadService } from './early-access-upload.service';
import { EarlyAccessOtpService } from './early-access-otp.service';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EarlyAccessRegistration, EarlyAccessOtp]),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 3600000, limit: 100 }]),
    SmsModule,
  ],
  controllers: [EarlyAccessController],
  providers: [EarlyAccessService, EarlyAccessUploadService, EarlyAccessOtpService],
  exports: [EarlyAccessService],
})
export class EarlyAccessModule {}
