import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BodaRatesService } from './boda-rates.service';
import { BodaRatesController } from './boda-rates.controller';
import { BodaRateCard } from './boda-rate-card.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BodaRateCard])],
  controllers: [BodaRatesController],
  providers: [BodaRatesService],
  exports: [BodaRatesService],
})
export class BodaRatesModule {}