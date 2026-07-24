import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { ScheduleModule } from '@nestjs/schedule';
@Module({
  controllers: [UploadController],
})
export class UploadModule {}