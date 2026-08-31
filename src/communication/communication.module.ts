import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommunicationEngineService } from './communication-engine.service';
import { CommunicationTemplate } from './entities/communication-template.entity';
import { CommunicationLog } from './entities/communication-log.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CommunicationTemplate, CommunicationLog]),
    NotificationsModule,
  ],
  providers: [CommunicationEngineService],
  exports: [CommunicationEngineService],
})
export class CommunicationModule {}
