/**
 * PickupPointsModule
 * Place at: src/pickup-points/pickup-points.module.ts
 * Register in: src/app.module.ts
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PickupPoint } from './entities/pickup-point.entity';
import { Agent } from '../agents/entities/agent.entity';
import { PickupPointsService } from './pickup-points.service';
import { PickupPointsController } from './pickup-points.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PickupPoint, Agent])],
  controllers: [PickupPointsController],
  providers: [PickupPointsService],
  exports: [PickupPointsService],
})
export class PickupPointsModule {}
