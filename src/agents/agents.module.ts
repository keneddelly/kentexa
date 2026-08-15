import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';
import { Agent } from './entities/agent.entity';
import { AgentTransaction } from './entities/agent-transaction.entity';
import { User } from '../users/entities/user.entity';
import { SmsModule } from '../sms/sms.module';
import { CommerceProfilesModule } from '../commerce-profiles/commerce-profiles.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Agent, User, AgentTransaction]),
    SmsModule,
    CommerceProfilesModule,
  ],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
