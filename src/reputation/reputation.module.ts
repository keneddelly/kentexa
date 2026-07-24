/**
 * ReputationModule
 * Place at: src/reputation/reputation.module.ts
 * Register in: src/app.module.ts
 */
import { Module }              from '@nestjs/common';
import { TypeOrmModule }       from '@nestjs/typeorm';
import { ReputationEvent }     from './entities/reputation-event.entity';
import { ReputationService }   from './reputation.service';
import { ReputationController } from './reputation.controller';
import { User }                from '../users/entities/user.entity';

@Module({
  imports:     [TypeOrmModule.forFeature([ReputationEvent, User])],
  controllers: [ReputationController],
  providers:   [ReputationService],
  exports:     [ReputationService],
})
export class ReputationModule {}