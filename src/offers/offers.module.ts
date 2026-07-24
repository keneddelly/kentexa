/**
 * OffersModule
 * Place at: src/offers/offers.module.ts
 * Register in: src/app.module.ts
 */
import { Module }          from '@nestjs/common';
import { TypeOrmModule }   from '@nestjs/typeorm';
import { Offer }           from './entities/offer.entity';
import { Classified }      from '../classifieds/entities/classified.entity';
import { OffersService }   from './offers.service';
import { OffersController } from './offers.controller';

@Module({
  imports:     [TypeOrmModule.forFeature([Offer, Classified])],
  controllers: [OffersController],
  providers:   [OffersService],
  exports:     [OffersService],
})
export class OffersModule {}