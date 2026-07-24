import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentOrdersService } from './agent-orders.service';
import { AgentOrdersController } from './agent-orders.controller';
import { Order } from '../orders/entities/order.entity';
import { Agent } from '../agents/entities/agent.entity';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Agent]),
    SmsModule,
  ],
  controllers: [AgentOrdersController],
  providers:   [AgentOrdersService],
  exports:     [AgentOrdersService],
})
export class AgentOrdersModule {}