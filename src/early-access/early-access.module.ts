import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { EarlyAccessRegistration } from './entities/early-access-registration.entity';
import { EarlyAccessController } from './early-access.controller';
import { EarlyAccessService } from './early-access.service';
import { EarlyAccessUploadService } from './early-access-upload.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([EarlyAccessRegistration]),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 3600000, limit: 100 }]),
  ],
  controllers: [EarlyAccessController],
  providers: [EarlyAccessService, EarlyAccessUploadService],
  exports: [EarlyAccessService],
})
export class EarlyAccessModule {}
