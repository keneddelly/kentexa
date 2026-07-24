import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TzRegion }        from './entities/tz-region.entity';
import { TzDistrict }      from './entities/tz-district.entity';
import { IntercityRoute }  from '../super-agents/entities/intercity-route.entity';
import { TzPricingService }    from './tz-pricing.service';
import { TzPricingController } from './tz-pricing.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([TzRegion, TzDistrict, IntercityRoute]),
  ],
  controllers: [TzPricingController],
  providers:   [TzPricingService],
  exports:     [TzPricingService],
})
export class TzPricingModule {}